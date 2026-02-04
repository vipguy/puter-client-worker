const API_URL = 'http://localhost:3000/api';
let currentPath = '/';
let createModalType = 'dir';

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        
        item.classList.add('active');
        const section = item.getAttribute('data-section');
        document.getElementById(section).classList.add('active');
    });
});

// Alert functions
function showAlert(message, type = 'success') {
    const alertBox = document.getElementById('alertBox');
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;
    
    setTimeout(() => {
        alertBox.classList.remove('show');
    }, 5000);
}

// Terminal functions
function addToTerminal(text, type = 'normal') {
    const terminal = document.getElementById('terminalOutput');
    const line = document.createElement('div');
    line.className = `terminal-line ${type === 'error' ? 'terminal-error' : type === 'success' ? 'terminal-success' : type === 'warning' ? 'terminal-warning' : ''}`;
    
    // Clean up the text
    const cleanText = text
        .replace(/\[\d+m/g, '') // Remove ANSI codes
        .replace(/puter@\w+>/g, '') // Remove shell prompts
        .trim();
    
    if (!cleanText) return; // Don't add empty lines
    
    const lines = cleanText.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;
    
    line.innerHTML = lines.map(l => `<span class="terminal-prompt">$</span> ${escapeHtml(l)}`).join('<br>');
    
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
    document.getElementById('terminalOutput').innerHTML = '<div class="terminal-line"><span class="terminal-prompt">$</span> Terminal cleared</div>';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// API helper with loading states
async function apiCall(endpoint, method = 'GET', body = null, buttonId = null) {
    const button = buttonId ? document.getElementById(buttonId) : null;
    const originalText = button ? button.textContent : '';
    
    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="loading"></span> Loading...';
        }
        
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`${API_URL}${endpoint}`, options);
        const result = await response.json();
        
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
        
        return result;
    } catch (error) {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
        return { success: false, error: error.message };
    }
}

// File upload helper
async function apiUpload(endpoint, formData, buttonId = null) {
    const button = buttonId ? document.getElementById(buttonId) : null;
    const originalText = button ? button.textContent : '';
    
    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="loading"></span> Uploading...';
        }
        
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
        
        return result;
    } catch (error) {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
        return { success: false, error: error.message };
    }
}

// Authentication functions
async function login() {
    const save = document.getElementById('saveCredentials').checked;
    addToTerminal(`Logging in${save ? ' (saving credentials)' : ''}...`);
    
    const result = await apiCall('/login', 'POST', { save }, 'loginBtnText');
    if (result.success) {
        addToTerminal('✓ Login successful', 'success');
        if (result.warning) addToTerminal(result.warning, 'warning');
        showAlert('Login successful!', 'success');
        
        // Wait a moment for login to propagate, then check status
        setTimeout(async () => {
            await checkLoginStatus();
        }, 1000);
    } else {
        addToTerminal(`✗ Login failed: ${result.error}`, 'error');
        showAlert(`Login failed: ${result.error}`, 'error');
    }
}

async function logout() {
    addToTerminal('Logging out...');
    const result = await apiCall('/logout', 'POST');
    
    if (result.success) {
        addToTerminal('✓ Logged out successfully', 'success');
        showAlert('Logged out successfully', 'success');
        updateStatus(false);
    } else {
        addToTerminal(`✗ Logout failed: ${result.error}`, 'error');
        showAlert(`Logout failed: ${result.error}`, 'error');
    }
}

async function whoami() {
    const result = await apiCall('/whoami');
    
    if (result.success && result.isLoggedIn) {
        const message = result.username ? `Logged in as: ${result.username}` : 'You are logged in to Puter';
        addToTerminal(message, 'success');
        if (result.username) {
            updateStatus(true, result.username);
        } else {
            updateStatus(true, 'Logged in');
        }
        showAlert(message, 'success');
    } else {
        addToTerminal('Not logged in', 'error');
        showAlert('Not logged in. Please login to continue.', 'error');
        updateStatus(false);
    }
}

async function diskUsage() {
    addToTerminal('Getting disk usage...');
    const result = await apiCall('/disk-usage');
    
    if (result.success && result.output) {
        addToTerminal(result.output, 'success');
        showAlert('Disk usage retrieved', 'success');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function getUsage() {
    addToTerminal('Getting usage stats...');
    const result = await apiCall('/usage');
    
    if (result.success && result.output) {
        addToTerminal(result.output, 'success');
        showAlert('Usage stats retrieved', 'success');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

// File operations
async function listFiles(path = currentPath) {
    const result = await apiCall(`/files?path=${encodeURIComponent(path)}`, 'GET', null, 'listFilesBtnText');
    
    if (result.success) {
        const fileList = document.getElementById('fileList');
        
        // Check if file operations are unavailable
        if (result.isFileOpsUnavailable) {
            fileList.innerHTML = `
                <li class="file-item" style="background: #fff3cd; border-color: #ffc107;">
                    <div style="flex: 1;">
                        <div style="color: #856404;">
                            <strong>⚠️ File Operations Not Available</strong>
                            <p style="margin-top: 10px;">File management is not supported in Puter CLI v2.</p>
                            <p>Please use the Puter web interface at <a href="https://puter.com" target="_blank" style="color: #667eea;">puter.com</a> for file operations.</p>
                        </div>
                    </div>
                </li>
            `;
            addToTerminal('⚠ File operations not available in CLI', 'warning');
            return;
        }
        
        const output = result.output.trim();
        if (output) {
            addToTerminal(output, 'success');
        }
        
        const lines = output.split('\n').filter(l => l.trim());
        
        if (lines.length > 0) {
            fileList.innerHTML = lines.map(line => {
                // Better directory detection: check for trailing slash, folder emoji, or 'd' prefix (common in ls output)
                const trimmedLine = line.trim();
                const isDir = trimmedLine.endsWith('/') || 
                             trimmedLine.includes('📁') || 
                             trimmedLine.includes('DIR') ||
                             trimmedLine.includes('<DIR>') ||
                             /^d/.test(trimmedLine); // Unix-style directory indicator
                const icon = isDir ? '📁' : '📄';
                const name = trimmedLine.replace(/\/$/, ''); // Remove trailing slash for cleaner display
                
                return `
                    <li class="file-item">
                        <span>
                            <span class="file-icon">${icon}</span>
                            ${escapeHtml(name)}
                        </span>
                        <div>
                            ${isDir ? `<button class="btn btn-primary btn-sm" onclick="navigateTo('${name}')">Open</button>` : ''}
                            <button class="btn btn-primary btn-sm" onclick="downloadFile('${name}')">Download</button>
                            <button class="btn btn-warning btn-sm" onclick="showFileInfo('${name}')">Info</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteFile('${name}')">Delete</button>
                        </div>
                    </li>
                `;
            }).join('');
        } else {
            fileList.innerHTML = '<li class="file-item">Empty directory</li>';
        }
    } else {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = `
            <li class="file-item" style="background: #f8d7da; border-color: #f5c6cb;">
                <div style="color: #721c24;">
                    <strong>❌ Error</strong>
                    <p style="margin-top: 5px;">${escapeHtml(result.error)}</p>
                </div>
            </li>
        `;
        addToTerminal(`Error: ${result.error}`, 'error');
    }
}

function navigateTo(path) {
    if (path === '/') {
        currentPath = '/';
    } else if (path === '..') {
        const parts = currentPath.split('/').filter(p => p);
        parts.pop();
        currentPath = '/' + parts.join('/');
    } else {
        currentPath = currentPath === '/' ? `/${path}` : `${currentPath}/${path}`;
    }
    
    document.getElementById('currentPath').textContent = currentPath;
    updateBreadcrumb();
    listFiles(currentPath);
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    const parts = currentPath.split('/').filter(p => p);
    
    let html = '<span class="breadcrumb-item" onclick="navigateTo(\'/\')">Home</span>';
    let path = '';
    
    parts.forEach((part, index) => {
        path += '/' + part;
        html += '<span class="breadcrumb-separator">/</span>';
        html += `<span class="breadcrumb-item" onclick="navigateTo('${path}')">${escapeHtml(part)}</span>`;
    });
    
    breadcrumb.innerHTML = html;
}

// Modal functions
function showCreateModal(type) {
    createModalType = type;
    const modal = document.getElementById('createModal');
    const title = document.getElementById('createModalTitle');
    const label = document.getElementById('createModalLabel');
    const input = document.getElementById('createModalInput');
    
    title.textContent = type === 'dir' ? 'Create New Folder' : 'Create New File';
    label.textContent = type === 'dir' ? 'Folder Name' : 'File Name';
    input.value = '';
    input.placeholder = type === 'dir' ? 'my-folder' : 'myfile.txt';
    
    modal.classList.add('show');
}

function showUploadModal() {
    document.getElementById('uploadModal').classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

async function handleCreate() {
    const name = document.getElementById('createModalInput').value.trim();
    
    if (!name) {
        showAlert('Please enter a name', 'error');
        return;
    }
    
    if (createModalType === 'dir') {
        await makeDir(name);
    } else {
        await createFile(name);
    }
    
    closeModal('createModal');
}

async function makeDir(name) {
    addToTerminal(`Creating folder: ${name}...`);
    const result = await apiCall('/mkdir', 'POST', { name, path: currentPath });
    
    if (result.success) {
        addToTerminal(`✓ Folder '${name}' created`, 'success');
        showAlert(`Folder '${name}' created successfully`, 'success');
        listFiles(currentPath);
    } else {
        addToTerminal(`✗ ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function createFile(name) {
    addToTerminal(`Creating file: ${name}...`);
    const result = await apiCall('/touch', 'POST', { name, path: currentPath });
    
    if (result.success) {
        addToTerminal(`✓ File '${name}' created`, 'success');
        showAlert(`File '${name}' created successfully`, 'success');
        listFiles(currentPath);
    } else {
        addToTerminal(`✗ ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function handleUpload() {
    const fileInput = document.getElementById('fileUploadInput');
    const remotePath = document.getElementById('uploadRemotePath').value || currentPath;
    
    if (!fileInput.files.length) {
        showAlert('Please select a file', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('remotePath', remotePath);
    
    addToTerminal(`Uploading: ${fileInput.files[0].name}`);
    const result = await apiUpload('/upload', formData);
    
    if (result.success) {
        addToTerminal(result.output, 'success');
        showAlert('File uploaded successfully', 'success');
        listFiles(currentPath);
        closeModal('uploadModal');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Upload failed: ${result.error}`, 'error');
    }
}

async function downloadFile(name) {
    addToTerminal(`Executing: puter pull ${name}`);
    const result = await apiCall('/download', 'POST', { path: name });
    
    if (result.success) {
        addToTerminal(result.output, 'success');
        showAlert(`File '${name}' downloaded`, 'success');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Download failed: ${result.error}`, 'error');
    }
}

async function deleteFile(name) {
    if (!confirm(`Are you sure you want to delete '${name}'?`)) {
        return;
    }
    
    addToTerminal(`Executing: puter rm ${name}`);
    const result = await apiCall(`/file?path=${encodeURIComponent(name)}&force=true`, 'DELETE');
    
    if (result.success) {
        addToTerminal(result.output, 'success');
        showAlert(`'${name}' deleted successfully`, 'success');
        listFiles(currentPath);
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Delete failed: ${result.error}`, 'error');
    }
}

async function showFileInfo(name) {
    addToTerminal(`Executing: puter stat ${name}`);
    const result = await apiCall('/stat', 'POST', { path: name });
    
    if (result.success) {
        addToTerminal(result.output, 'success');
        showAlert('File info retrieved', 'success');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

// Site operations
async function createSite() {
    const name = document.getElementById('siteName').value.trim();
    const subdomain = document.getElementById('siteSubdomain').value.trim();
    const dir = document.getElementById('siteDir').value.trim();
    
    if (!name) {
        showAlert('Please enter a site name', 'error');
        return;
    }
    
    let cmd = `puter site:create ${name}`;
    if (subdomain) cmd += ` --subdomain=${subdomain}`;
    if (dir) cmd += ` ${dir}`;
    
    addToTerminal(`Executing: ${cmd}`);
    const result = await apiCall('/site/create', 'POST', { name, subdomain, dir }, 'createSiteBtnText');
    
    if (result.success) {
        addToTerminal(result.output, 'success');
        showAlert(`Site '${name}' created successfully`, 'success');
        listSites();
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function deploySite() {
    const subdomain = document.getElementById('deploySubdomain').value.trim();
    const dir = document.getElementById('deployDir').value.trim();
    
    addToTerminal('Executing: puter site:deploy');
    const result = await apiCall('/site/deploy', 'POST', { subdomain, dir });
    
    if (result.success) {
        addToTerminal(result.output, 'success');
        showAlert('Site deployed successfully', 'success');
        listSites();
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Deploy failed: ${result.error}`, 'error');
    }
}

async function listSites() {
    const result = await apiCall('/sites', 'GET', null, 'listSitesBtnText');
    
    if (result.success && result.output) {
        const siteList = document.getElementById('siteList');
        
        // Parse the table - look for data rows
        const lines = result.output.split('\n');
        const sites = [];
        
        for (const line of lines) {
            // Skip borders, headers, and empty lines
            if (!line.includes('│') || 
                line.includes('┌') || 
                line.includes('├') || 
                line.includes('└') ||
                line.includes('UID') ||
                line.trim() === '') {
                continue;
            }
            
            // Parse data row
            const parts = line.split('│').map(p => p.trim()).filter(p => p);
            
            if (parts.length >= 2) {
                const num = parts[0];
                const uid = parts[1];
                const subdomain = parts[2] || '';
                const created = parts[3] || '';
                
                // Skip if it's not a valid site row
                if (isNaN(parseInt(num))) continue;
                
                sites.push({ num, uid, subdomain, created });
            }
        }
        
        if (sites.length > 0) {
            siteList.innerHTML = sites.map(site => {
                const url = site.subdomain ? `https://${site.subdomain}.puter.site` : '';
                return `
                    <li class="file-item">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <span style="font-size: 20px;">🌐</span>
                                <strong style="font-size: 16px;">${escapeHtml(site.subdomain || site.uid)}</strong>
                            </div>
                            <div style="font-size: 12px; color: #6c757d; margin-left: 30px;">
                                <div>UID: ${escapeHtml(site.uid)}</div>
                                ${url ? `<div>URL: <a href="${url}" target="_blank" style="color: #667eea;">${url}</a></div>` : ''}
                                ${site.created ? `<div>Created: ${escapeHtml(site.created)}</div>` : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 5px; flex-direction: column;">
                            ${url ? `<button class="btn btn-primary btn-sm" onclick="window.open('${url}', '_blank')">Visit Site</button>` : ''}
                            <button class="btn btn-danger btn-sm" onclick="deleteSite('${escapeHtml(site.uid)}')">Delete</button>
                        </div>
                    </li>
                `;
            }).join('');
            
            addToTerminal(`✓ Found ${sites.length} site(s)`, 'success');
            showAlert(`Found ${sites.length} site(s)`, 'success');
        } else {
            siteList.innerHTML = '<li class="file-item">No sites found</li>';
            addToTerminal('No sites found', 'warning');
        }
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function deleteSite(uid) {
    if (!confirm(`Are you sure you want to delete site '${uid}'?`)) {
        return;
    }
    
    addToTerminal(`Deleting site: ${uid}...`);
    const result = await apiCall(`/site?uid=${encodeURIComponent(uid)}`, 'DELETE');
    
    if (result.success) {
        addToTerminal(`✓ Site '${uid}' deleted`, 'success');
        showAlert(`Site '${uid}' deleted successfully`, 'success');
        listSites();
    } else {
        addToTerminal(`✗ ${result.error}`, 'error');
        showAlert(`Delete failed: ${result.error}`, 'error');
    }
}

// App operations
async function createApp() {
    const name = document.getElementById('appName').value.trim();
    const dir = document.getElementById('appDir').value.trim();
    const url = document.getElementById('appUrl').value.trim();
    const description = document.getElementById('appDescription').value.trim();
    
    if (!name) {
        showAlert('Please enter an app name', 'error');
        return;
    }
    
    let cmd = `puter app:create ${name}`;
    if (dir) cmd += ` ${dir}`;
    if (description) cmd += ` --description="${description}"`;
    if (url) cmd += ` --url=${url}`;
    
    addToTerminal(`Executing: ${cmd}`);
    const result = await apiCall('/app/create', 'POST', { name, dir, description, url }, 'createAppBtnText');
    
    if (result.success) {
        addToTerminal(result.output, 'success');
        showAlert(`App '${name}' created successfully`, 'success');
        listApps();
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function listApps() {
    const period = document.getElementById('appPeriod').value;
    const cmd = period ? `puter apps ${period}` : 'puter apps';
    
    const result = await apiCall(`/apps${period ? '?period=' + period : ''}`, 'GET', null, 'listAppsBtnText');
    
    if (result.success && result.output) {
        const appList = document.getElementById('appList');
        
        // Parse the table - look for data rows (lines with │ that aren't borders or headers)
        const lines = result.output.split('\n');
        const apps = [];
        
        for (const line of lines) {
            // Skip borders, headers, and empty lines
            if (!line.includes('│') || 
                line.includes('┌') || 
                line.includes('├') || 
                line.includes('└') ||
                line.includes('Title') ||
                line.trim() === '') {
                continue;
            }
            
            // Parse data row: │ # │ Title │ Name │ Created │ Subdomain │ #Open │ #User │
            const parts = line.split('│').map(p => p.trim()).filter(p => p);
            
            if (parts.length >= 5) {
                const num = parts[0];
                const title = parts[1];
                const name = parts[2];
                const created = parts[3];
                const subdomain = parts[4];
                const opens = parts[5] || '0';
                const users = parts[6] || '0';
                
                // Skip if it's not a valid app row
                if (isNaN(parseInt(num))) continue;
                
                apps.push({ num, title, name, created, subdomain, opens, users });
            }
        }
        
        if (apps.length > 0) {
            appList.innerHTML = apps.map(app => {
                const url = `https://${app.subdomain}.puter.site`;
                return `
                    <li class="file-item">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <span style="font-size: 20px;">📱</span>
                                <strong style="font-size: 16px;">${escapeHtml(app.title)}</strong>
                            </div>
                            <div style="font-size: 12px; color: #6c757d; margin-left: 30px;">
                                <div>Name: ${escapeHtml(app.name)}</div>
                                <div>Subdomain: <a href="${url}" target="_blank" style="color: #667eea;">${escapeHtml(app.subdomain)}</a></div>
                                <div>Created: ${escapeHtml(app.created)}</div>
                                <div>Stats: ${escapeHtml(app.opens)} opens • ${escapeHtml(app.users)} users</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 5px; flex-direction: column;">
                            <button class="btn btn-primary btn-sm" onclick="window.open('${url}', '_blank')">Open App</button>
                            <button class="btn btn-warning btn-sm" onclick="updateApp('${escapeHtml(app.name)}')">Update</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteApp('${escapeHtml(app.name)}')">Delete</button>
                        </div>
                    </li>
                `;
            }).join('');
            
            addToTerminal(`✓ Found ${apps.length} app(s)`, 'success');
            showAlert(`Found ${apps.length} app(s)`, 'success');
        } else {
            appList.innerHTML = '<li class="file-item">No apps found</li>';
            addToTerminal('No apps found', 'warning');
        }
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function updateApp(name) {
    const dir = prompt(`Enter directory path to update app '${name}':`);
    if (!dir) return;
    
    addToTerminal(`Updating app: ${name}...`);
    const result = await apiCall('/app/update', 'POST', { name, dir });
    
    if (result.success) {
        addToTerminal(`✓ App '${name}' updated`, 'success');
        showAlert(`App '${name}' updated successfully`, 'success');
        listApps();
    } else {
        addToTerminal(`✗ ${result.error}`, 'error');
        showAlert(`Update failed: ${result.error}`, 'error');
    }
}

async function deleteApp(name) {
    if (!confirm(`Are you sure you want to delete app '${name}'?`)) {
        return;
    }
    
    addToTerminal(`Deleting app: ${name}...`);
    const result = await apiCall(`/app?name=${encodeURIComponent(name)}&force=true`, 'DELETE');
    
    if (result.success) {
        addToTerminal(`✓ App '${name}' deleted`, 'success');
        showAlert(`App '${name}' deleted successfully`, 'success');
        listApps();
    } else {
        addToTerminal(`✗ ${result.error}`, 'error');
        showAlert(`Delete failed: ${result.error}`, 'error');
    }
}

// Terminal command execution
async function executeCommand() {
    const input = document.getElementById('terminalInput').value.trim();
    if (!input) return;
    
    addToTerminal(`> ${input}`, 'normal');
    
    // Check if it's a file command
    const fileCommands = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'cat', 'push', 'pull', 'update', 'edit', 'stat', 'clean'];
    const isFileCommand = fileCommands.some(cmd => input.startsWith(cmd + ' ') || input === cmd);
    
    if (isFileCommand) {
        addToTerminal('⚠ File operations are not available via Puter CLI on Windows due to a known bug.', 'warning');
        addToTerminal('Please use the Puter web interface at https://puter.com for file management.', 'warning');
        document.getElementById('terminalInput').value = '';
        return;
    }
    
    const result = await apiCall('/execute', 'POST', { command: input });
    
    if (result.success) {
        if (result.output && result.output.trim()) {
            addToTerminal(result.output, 'success');
        } else {
            addToTerminal('Command executed (no output)', 'success');
        }
        if (result.stderr) addToTerminal(result.stderr, 'warning');
        if (result.warning) addToTerminal(result.warning, 'warning');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        if (result.code) addToTerminal(`Error code: ${result.code}`, 'error');
    }
    
    // Clear input
    document.getElementById('terminalInput').value = '';
}

// Status update
function updateStatus(connected, user = null) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const userInfo = document.getElementById('userInfo');
    
    if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Connected';
        userInfo.textContent = user || 'Logged in';
    } else {
        dot.classList.remove('connected');
        text.textContent = 'Not Connected';
        userInfo.textContent = 'Not logged in';
    }
}

// Enter key support
document.getElementById('terminalInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeCommand();
});

document.getElementById('createModalInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCreate();
});

// Check connection on load
window.addEventListener('load', async () => {
    await checkLoginStatus();
});

async function getUserInfo() {
    addToTerminal('Getting user information...');
    const result = await apiCall('/user-info');
    
    if (result.success && result.output) {
        addToTerminal(result.output, 'success');
        showAlert('User info retrieved', 'success');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function checkLoginStatus() {
    try {
        const result = await apiCall('/whoami');
        if (result.success && result.isLoggedIn) {
            const username = result.username || 'aibotgpt905'; // Use known username as fallback
            updateStatus(true, username);
            addToTerminal(`✓ Logged in as ${username}`, 'success');
        } else {
            updateStatus(false);
            addToTerminal('⚠ Not logged in. Please login to continue.', 'warning');
        }
    } catch (error) {
        console.log('Login check failed:', error);
        updateStatus(false);
        addToTerminal('⚠ Not logged in. Please login to continue.', 'warning');
    }
}


// Worker operations
async function createWorker() {
    const name = document.getElementById('workerName').value.trim();
    const code = document.getElementById('workerCode').value.trim();
    
    if (!name) {
        showAlert('Please enter a worker name', 'error');
        return;
    }
    
    if (!code) {
        showAlert('Please enter worker code', 'error');
        return;
    }
    
    addToTerminal(`Creating worker: ${name}...`);
    const result = await apiCall('/worker/create', 'POST', { name, code }, 'createWorkerBtnText');
    
    if (result.success) {
        addToTerminal(`✓ ${result.output}`, 'success');
        if (result.url) {
            addToTerminal(`URL: ${result.url}`, 'success');
        }
        showAlert(`Worker '${name}' deployed successfully`, 'success');
        
        // Clear form
        document.getElementById('workerName').value = '';
        document.getElementById('workerCode').value = '';
        
        // Refresh worker list
        listWorkers();
    } else {
        addToTerminal(`✗ ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function listWorkers() {
    const result = await apiCall('/workers', 'GET', null, 'listWorkersBtnText');
    
    if (result.success && result.workers) {
        const workerList = document.getElementById('workerList');
        
        if (result.workers.length > 0) {
            workerList.innerHTML = result.workers.map(worker => {
                const createdDate = new Date(worker.created_at).toLocaleString();
                return `
                    <li class="file-item">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <span style="font-size: 20px;">⚙️</span>
                                <strong style="font-size: 16px;">${escapeHtml(worker.name)}</strong>
                            </div>
                            <div style="font-size: 12px; color: #6c757d; margin-left: 30px;">
                                <div>URL: <a href="${worker.url}" target="_blank" style="color: #667eea;">${escapeHtml(worker.url)}</a></div>
                                <div>Created: ${escapeHtml(createdDate)}</div>
                                <div>File: ${escapeHtml(worker.file_path)}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 5px; flex-direction: column;">
                            <button class="btn btn-primary btn-sm" onclick="window.open('${worker.url}', '_blank')">Open Worker</button>
                            <button class="btn btn-warning btn-sm" onclick="getWorkerInfo('${escapeHtml(worker.name)}')">Info</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteWorker('${escapeHtml(worker.name)}')">Delete</button>
                        </div>
                    </li>
                `;
            }).join('');
            
            addToTerminal(`✓ Found ${result.workers.length} worker(s)`, 'success');
            showAlert(`Found ${result.workers.length} worker(s)`, 'success');
        } else {
            workerList.innerHTML = '<li class="file-item">No workers found</li>';
            addToTerminal('No workers found', 'warning');
        }
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function getWorkerInfo(name) {
    addToTerminal(`Getting info for worker: ${name}...`);
    const result = await apiCall(`/worker/${encodeURIComponent(name)}`, 'GET');
    
    if (result.success && result.worker) {
        const info = JSON.stringify(result.worker, null, 2);
        addToTerminal(info, 'success');
        showAlert('Worker info retrieved', 'success');
    } else {
        addToTerminal(`Error: ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}

async function deleteWorker(name) {
    if (!confirm(`Are you sure you want to delete worker '${name}'?`)) {
        return;
    }
    
    addToTerminal(`Deleting worker: ${name}...`);
    const result = await apiCall(`/worker/${encodeURIComponent(name)}`, 'DELETE');
    
    if (result.success) {
        addToTerminal(`✓ ${result.output}`, 'success');
        showAlert(`Worker '${name}' deleted successfully`, 'success');
        listWorkers();
    } else {
        addToTerminal(`✗ ${result.error}`, 'error');
        showAlert(`Failed: ${result.error}`, 'error');
    }
}
