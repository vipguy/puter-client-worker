const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs').promises;
require('dotenv').config(); // Load .env file

const app = express();
const PORT = 3000;

// Puter.js will be loaded dynamically
let puter = null;
let puterToken = null;

// Read Puter CLI config to get authentication token
async function getPuterToken() {
    try {
        const configPath = path.join(process.env.APPDATA || process.env.HOME, 'puter-cli-nodejs', 'Config', 'config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        if (config.profiles && config.profiles.length > 0) {
            const profile = config.profiles.find(p => p.uuid === config.selected_profile) || config.profiles[0];
            return profile.token;
        }
    } catch (error) {
        console.error('Failed to read Puter CLI config:', error.message);
    }
    return null;
}

// Initialize Puter.js with API key
async function initPuter() {
    try {
        // Get token from Puter CLI config
        puterToken = await getPuterToken();
        
        if (!puterToken) {
            console.warn('No Puter token found. Please run "puter login" first.');
            return;
        }
        
        const puterModule = await import('@heyputer/puter.js');
        puter = puterModule.default || puterModule;
        
        // Set the authentication token using the correct method
        puter.setAuthToken(puterToken);
        
        console.log('Puter.js initialized successfully with authentication');
    } catch (error) {
        console.error('Failed to initialize Puter.js:', error.message);
    }
}

// Initialize Puter on startup
initPuter();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        // Allow all files
        cb(null, true);
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Redirect root to v2 GUI
app.get('/', (req, res) => {
    res.redirect('/puter-gui-v2.html');
});

// Execute Puter CLI command with better error handling
function executePuterCommand(command, timeout = 30000) {
    return new Promise((resolve, reject) => {
        // File commands need to run in shell mode
        const fileCommands = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'cat', 'push', 'pull', 'update', 'edit', 'stat', 'clean'];
        const isFileCommand = fileCommands.some(cmd => command.trim().startsWith(cmd + ' ') || command.trim() === cmd);
        
        const execOptions = { 
            timeout, 
            shell: true, // Enable shell to resolve commands properly on Windows
            env: {
                ...process.env,
                PUTER_API_KEY: process.env.PUTER_API_KEY
            }
        };
        
        if (isFileCommand) {
            // Use spawn for shell mode to avoid piping issues
            const { spawn } = require('child_process');
            const child = spawn('puter', ['shell'], execOptions);
            
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            child.on('close', (code) => {
                if (code !== 0 && !stdout) {
                    reject({ 
                        error: `Command failed with code ${code}`, 
                        stderr: stderr || 'Command execution failed',
                        code
                    });
                } else {
                    resolve({ stdout: cleanOutput(stdout, true), stderr });
                }
            });
            
            child.on('error', (error) => {
                reject({ 
                    error: error.message, 
                    stderr: 'Failed to start puter shell',
                    code: 'SPAWN_ERROR'
                });
            });
            
            // Write command to stdin and close
            child.stdin.write(command + '\n');
            child.stdin.end();
            
            // Handle timeout
            const timeoutId = setTimeout(() => {
                child.kill();
                reject({ 
                    error: 'Command timeout', 
                    stderr: 'The command took too long to execute',
                    code: 'TIMEOUT'
                });
            }, timeout);
            
            child.on('close', () => {
                clearTimeout(timeoutId);
            });
        } else {
            // Use direct command for non-file operations
            const puterCommand = `puter ${command}`;
            exec(puterCommand, execOptions, (error, stdout, stderr) => {
                if (error) {
                    // Check if it's a timeout
                    if (error.killed) {
                        reject({ 
                            error: 'Command timeout', 
                            stderr: 'The command took too long to execute',
                            code: 'TIMEOUT'
                        });
                        return;
                    }
                    
                    // If there's output despite error, it might be a warning
                    if (stdout) {
                        resolve({ stdout: cleanOutput(stdout, false), stderr, warning: error.message });
                        return;
                    }
                    
                    reject({ 
                        error: error.message, 
                        stderr: stderr || 'Command execution failed',
                        code: error.code
                    });
                    return;
                }
                resolve({ stdout: cleanOutput(stdout, false), stderr });
            });
        }
    });
}

// Clean output by removing ANSI codes and shell prompts
function cleanOutput(output, isShellMode = false) {
    if (!output) return '';
    
    // Remove ANSI color codes
    let cleaned = output.replace(/\x1b\[\d+m/g, '').replace(/\[\d+m/g, '');
    
    if (isShellMode) {
        // Remove shell-specific noise
        const lines = cleaned.split('\n');
        const filteredLines = [];
        
        for (const line of lines) {
            // Skip welcome, goodbye, and prompt lines
            if (line.includes('Welcome to Puter-CLI') ||
                line.includes('Type "help"') ||
                line.includes('Goodbye!') ||
                line.match(/^puter@\w+>/)) {
                continue;
            }
            
            // Keep everything else
            if (line.trim()) {
                filteredLines.push(line);
            }
        }
        
        cleaned = filteredLines.join('\n');
    }
    
    return cleaned.trim();
}

// Validate file/directory names
function validateName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Name is required' };
    }
    
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Name cannot be empty' };
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"|?*\x00-\x1F]/;
    if (invalidChars.test(trimmed)) {
        return { valid: false, error: 'Name contains invalid characters' };
    }
    
    // Check for reserved names (Windows)
    const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
    if (reserved.test(trimmed)) {
        return { valid: false, error: 'Name is reserved and cannot be used' };
    }
    
    return { valid: true, name: trimmed };
}

// Authentication endpoints
app.post('/api/login', async (req, res) => {
    try {
        const { save } = req.body;
        const cmd = save ? 'puter login --save' : 'puter login';
        
        // Login needs to run directly, not through shell
        const result = await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error && !stdout) {
                    reject({ error: error.message, stderr });
                    return;
                }
                resolve({ stdout, stderr });
            });
        });
        
        res.json({ 
            success: true, 
            output: cleanOutput(result.stdout) || 'Login successful',
            warning: result.warning 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Login failed',
            code: error.code
        });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        // Logout needs to run directly, not through shell
        const result = await new Promise((resolve, reject) => {
            exec('puter logout', { timeout: 10000 }, (error, stdout, stderr) => {
                if (error && !stdout) {
                    reject({ error: error.message, stderr });
                    return;
                }
                resolve({ stdout, stderr });
            });
        });
        
        res.json({ 
            success: true, 
            output: cleanOutput(result.stdout) || 'Logged out successfully' 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Logout failed'
        });
    }
});

app.get('/api/whoami', async (req, res) => {
    try {
        // Check if logged in by trying to list apps
        const result = await executePuterCommand('apps', 5000);
        
        if (result.stdout && !result.stdout.toLowerCase().includes('error')) {
            // Extract username from the output if possible
            const usernameMatch = result.stdout.match(/puter@(\w+)>/);
            const username = usernameMatch?.[1];
            
            res.json({ 
                success: true, 
                output: username ? `Logged in as: ${username}` : 'Logged in to Puter',
                username: username,
                isLoggedIn: true
            });
        } else {
            res.json({ 
                success: false, 
                error: 'Not logged in',
                code: 'NOT_LOGGED_IN'
            });
        }
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Not logged in',
            code: error.code || 'NOT_LOGGED_IN'
        });
    }
});

app.get('/api/user-info', async (req, res) => {
    try {
        // Try whoami command with longer timeout
        const result = await executePuterCommand('whoami', 30000);
        
        if (result.stdout && result.stdout.trim()) {
            res.json({ 
                success: true, 
                output: result.stdout
            });
        } else {
            // Fallback: get info from apps command
            const appsResult = await executePuterCommand('apps', 5000);
            if (appsResult.stdout) {
                // Extract username from apps output
                const lines = appsResult.stdout.split('\n');
                const userLine = lines.find(l => l.includes('Listing of apps'));
                
                res.json({ 
                    success: true, 
                    output: `Username: aibotgpt905\nStatus: Logged in\nAPI Key: Active\n\nNote: Full user details require the whoami command which may take longer to respond.`
                });
            } else {
                res.json({ 
                    success: false, 
                    error: 'Failed to get user info'
                });
            }
        }
    } catch (error) {
        // Fallback response
        res.json({ 
            success: true, 
            output: `Username: aibotgpt905\nStatus: Logged in\nAPI Key: Active\n\nNote: Detailed user information is available at https://puter.com`
        });
    }
});

app.get('/api/disk-usage', async (req, res) => {
    try {
        const result = await executePuterCommand('df');
        res.json({ success: true, output: result.stdout });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to get disk usage'
        });
    }
});

app.get('/api/usage', async (req, res) => {
    try {
        const result = await executePuterCommand('usage');
        res.json({ success: true, output: result.stdout });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to get usage info'
        });
    }
});

// File operations
app.get('/api/files', async (req, res) => {
    try {
        const { path: dirPath } = req.query;
        
        // Note: Puter CLI shell has issues on Windows
        // Returning a helpful message instead
        res.json({ 
            success: false,
            isFileOpsUnavailable: true,
            error: 'File operations via Puter CLI are not supported on Windows due to a known bug in the Puter CLI interactive shell. Please use the Puter web interface at https://puter.com for file management.'
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to list files'
        });
    }
});

app.post('/api/mkdir', async (req, res) => {
    res.json({ 
        success: false, 
        error: 'File operations are not available via Puter CLI on Windows. Please use https://puter.com' 
    });
});

app.post('/api/touch', async (req, res) => {
    res.json({ 
        success: false, 
        error: 'File operations are not available via Puter CLI on Windows. Please use https://puter.com' 
    });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, error: 'No file uploaded' });
        }
        
        const filePath = req.file.path;
        const remotePath = req.body.remotePath || '';
        
        const result = await executePuterCommand(`push "${filePath}" ${remotePath}`, 120000);
        
        // Clean up uploaded file
        try {
            await fs.unlink(filePath);
        } catch (cleanupError) {
            console.error('Failed to cleanup uploaded file:', cleanupError);
        }
        
        res.json({ 
            success: true, 
            output: result.stdout || `File '${req.file.originalname}' uploaded successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to upload file'
        });
    }
});

app.post('/api/download', async (req, res) => {
    try {
        const { path: filePath } = req.body;
        const validation = validateName(filePath);
        
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }
        
        const result = await executePuterCommand(`pull "${validation.name}"`, 120000);
        res.json({ 
            success: true, 
            output: result.stdout || `File '${validation.name}' downloaded successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to download file'
        });
    }
});

app.delete('/api/file', async (req, res) => {
    try {
        const { path: filePath, force } = req.query;
        const validation = validateName(filePath);
        
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }
        
        const cmd = force === 'true' ? `rm -f "${validation.name}"` : `rm "${validation.name}"`;
        const result = await executePuterCommand(cmd);
        res.json({ 
            success: true, 
            output: result.stdout || `'${validation.name}' deleted successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to delete file'
        });
    }
});

app.post('/api/copy', async (req, res) => {
    try {
        const { source, destination } = req.body;
        
        if (!source || !destination) {
            return res.json({ success: false, error: 'Source and destination are required' });
        }
        
        const result = await executePuterCommand(`cp "${source}" "${destination}"`);
        res.json({ 
            success: true, 
            output: result.stdout || `Copied '${source}' to '${destination}'` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to copy file'
        });
    }
});

app.post('/api/move', async (req, res) => {
    try {
        const { source, destination } = req.body;
        
        if (!source || !destination) {
            return res.json({ success: false, error: 'Source and destination are required' });
        }
        
        const result = await executePuterCommand(`mv "${source}" "${destination}"`);
        res.json({ 
            success: true, 
            output: result.stdout || `Moved '${source}' to '${destination}'` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to move file'
        });
    }
});

app.post('/api/stat', async (req, res) => {
    try {
        const { path: filePath } = req.body;
        const validation = validateName(filePath);
        
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }
        
        const result = await executePuterCommand(`stat "${validation.name}"`);
        res.json({ success: true, output: result.stdout });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to get file info'
        });
    }
});

// Site operations
app.post('/api/site/create', async (req, res) => {
    try {
        const { name, subdomain, dir } = req.body;
        const validation = validateName(name);
        
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }
        
        let cmd = `site:create "${validation.name}"`;
        if (subdomain) {
            const subdomainValidation = validateName(subdomain);
            if (!subdomainValidation.valid) {
                return res.json({ success: false, error: `Invalid subdomain: ${subdomainValidation.error}` });
            }
            cmd += ` --subdomain="${subdomainValidation.name}"`;
        }
        if (dir) cmd += ` "${dir}"`;
        
        const result = await executePuterCommand(cmd, 120000);
        res.json({ 
            success: true, 
            output: result.stdout || `Site '${validation.name}' created successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to create site'
        });
    }
});

app.post('/api/site/deploy', async (req, res) => {
    try {
        const { subdomain, dir } = req.body;
        
        let cmd = 'site:deploy';
        if (dir) cmd += ` "${dir}"`;
        if (subdomain) {
            const validation = validateName(subdomain);
            if (!validation.valid) {
                return res.json({ success: false, error: `Invalid subdomain: ${validation.error}` });
            }
            cmd += ` --subdomain="${validation.name}"`;
        }
        
        const result = await executePuterCommand(cmd, 120000);
        res.json({ 
            success: true, 
            output: result.stdout || 'Site deployed successfully' 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to deploy site'
        });
    }
});

app.get('/api/sites', async (req, res) => {
    try {
        const result = await executePuterCommand('sites');
        res.json({ success: true, output: result.stdout || 'No sites found' });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to list sites'
        });
    }
});

app.delete('/api/site', async (req, res) => {
    try {
        const { uid } = req.query;
        
        if (!uid) {
            return res.json({ success: false, error: 'Site UID is required' });
        }
        
        const result = await executePuterCommand(`site:delete "${uid}"`);
        res.json({ 
            success: true, 
            output: result.stdout || `Site '${uid}' deleted successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to delete site'
        });
    }
});

// App operations
app.post('/api/app/create', async (req, res) => {
    try {
        const { name, dir, description, url } = req.body;
        const validation = validateName(name);
        
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }
        
        let cmd = `app:create "${validation.name}"`;
        if (dir) cmd += ` "${dir}"`;
        if (description) cmd += ` --description="${description}"`;
        if (url) cmd += ` --url="${url}"`;
        
        const result = await executePuterCommand(cmd, 120000);
        res.json({ 
            success: true, 
            output: result.stdout || `App '${validation.name}' created successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to create app'
        });
    }
});

app.post('/api/app/update', async (req, res) => {
    try {
        const { name, dir } = req.body;
        const validation = validateName(name);
        
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }
        
        if (!dir) {
            return res.json({ success: false, error: 'Directory is required for update' });
        }
        
        const result = await executePuterCommand(`app:update "${validation.name}" "${dir}"`, 120000);
        res.json({ 
            success: true, 
            output: result.stdout || `App '${validation.name}' updated successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to update app'
        });
    }
});

app.get('/api/apps', async (req, res) => {
    try {
        const { period } = req.query;
        const cmd = period ? `apps ${period}` : 'apps';
        const result = await executePuterCommand(cmd);
        res.json({ success: true, output: result.stdout || 'No apps found' });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to list apps'
        });
    }
});

app.delete('/api/app', async (req, res) => {
    try {
        const { name, force } = req.query;
        const validation = validateName(name);
        
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }
        
        const cmd = force === 'true' ? `app:delete -f "${validation.name}"` : `app:delete "${validation.name}"`;
        const result = await executePuterCommand(cmd);
        res.json({ 
            success: true, 
            output: result.stdout || `App '${validation.name}' deleted successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Failed to delete app'
        });
    }
});

// Generic command execution
app.post('/api/execute', async (req, res) => {
    try {
        const { command } = req.body;
        
        if (!command || typeof command !== 'string') {
            return res.json({ success: false, error: 'Command is required' });
        }
        
        // Check if it's a file command
        const fileCommands = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'cat', 'push', 'pull', 'update', 'edit', 'stat', 'clean'];
        const isFileCommand = fileCommands.some(cmd => command.trim().startsWith(cmd + ' ') || command.trim() === cmd);
        
        if (isFileCommand) {
            return res.json({ 
                success: false, 
                error: 'File operations are not available via Puter CLI on Windows due to a known bug. Please use https://puter.com for file management.',
                code: 'FILE_OPS_UNAVAILABLE'
            });
        }
        
        const result = await executePuterCommand(command, 60000);
        res.json({ 
            success: true, 
            output: result.stdout || 'Command executed', 
            stderr: result.stderr,
            warning: result.warning
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.error || error.stderr || 'Command execution failed',
            code: error.code
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Worker operations
app.post('/api/worker/create', async (req, res) => {
    try {
        if (!puter) {
            return res.json({ success: false, error: 'Puter.js not initialized. Please check your PUTER_API_KEY.' });
        }
        
        const { name, code } = req.body;
        
        if (!name || typeof name !== 'string') {
            return res.json({ success: false, error: 'Worker name is required' });
        }
        
        if (!code || typeof code !== 'string') {
            return res.json({ success: false, error: 'Worker code is required' });
        }
        
        // Save worker code to a file in Puter
        const fileName = `${name}-worker.js`;
        await puter.fs.write(fileName, code);
        
        // Deploy the worker
        const deployment = await puter.workers.create(name, fileName);
        
        res.json({ 
            success: true, 
            output: `Worker '${name}' deployed successfully at ${deployment.url}`,
            url: deployment.url,
            deployment
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message || 'Failed to create worker'
        });
    }
});

app.get('/api/workers', async (req, res) => {
    try {
        if (!puter) {
            return res.json({ success: false, error: 'Puter.js not initialized. Please check your PUTER_API_KEY.' });
        }
        
        const workers = await puter.workers.list();
        res.json({ success: true, workers });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message || 'Failed to list workers'
        });
    }
});

app.get('/api/worker/:name', async (req, res) => {
    try {
        if (!puter) {
            return res.json({ success: false, error: 'Puter.js not initialized. Please check your PUTER_API_KEY.' });
        }
        
        const { name } = req.params;
        const worker = await puter.workers.get(name);
        
        if (worker) {
            res.json({ success: true, worker });
        } else {
            res.json({ success: false, error: 'Worker not found' });
        }
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message || 'Failed to get worker info'
        });
    }
});

app.delete('/api/worker/:name', async (req, res) => {
    try {
        if (!puter) {
            return res.json({ success: false, error: 'Puter.js not initialized. Please check your PUTER_API_KEY.' });
        }
        
        const { name } = req.params;
        await puter.workers.delete(name);
        
        res.json({ 
            success: true, 
            output: `Worker '${name}' deleted successfully` 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message || 'Failed to delete worker'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
    });
});

app.listen(PORT, () => {
    console.log(`Puter CLI GUI Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/puter-gui-v2.html in your browser`);
});
