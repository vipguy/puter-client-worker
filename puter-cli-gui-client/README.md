# Puter CLI GUI Client

A modern graphical interface for the Puter Cloud Platform CLI, built with Node.js and Express.

## Features

✅ **Authentication Management**
- Login/Logout
- User information display
- Disk usage monitoring

✅ **Application Management**
- Create, list, update, and delete apps
- View app statistics
- Direct links to deployed apps

✅ **Static Site Hosting**
- Create and deploy static sites
- Manage subdomains
- List all hosted sites

✅ **Serverless Workers**
- Create and deploy workers with custom code
- List all workers
- View worker details
- Delete workers
- Direct links to worker endpoints

✅ **Terminal Interface**
- Execute Puter CLI commands
- Quick command buttons
- Command history in terminal output

## Prerequisites

- Node.js (v20 or higher)
- npm (v7 or higher)
- Puter CLI installed globally (`npm install -g puter-cli`)
- Puter account (sign up at https://puter.com)

## Installation

1. Install dependencies:
```bash
npm install
```

2. (Optional) Copy `.env` to `.env` if you want to use API key authentication:
```bash
cp .env.example .env
# Edit .env and add your PUTER_API_KEY
```

3. Make sure you're logged in to Puter CLI:
```bash
puter login
```

4. Start the server:
```bash
npm start
```

5. Open your browser and navigate to:
```
http://localhost:3000/puter-gui-v2.html
```

## Usage

### Authentication
The GUI automatically uses your Puter CLI authentication. Make sure you're logged in via `puter login` before using the GUI.

### Creating Workers
1. Click on the "⚙️ Workers" tab
2. Enter a worker name
3. Write your worker code (JavaScript with router API)
4. Click "Create & Deploy Worker"
5. Wait 5-30 seconds for propagation

Example worker code:
```javascript
// Simple GET endpoint
router.get('/api/hello', async (event) => {
    return 'Hello, World!';
});
```

### Managing Apps
1. Click on the "📱 Applications" tab
2. Create new apps with custom names and descriptions
3. View app statistics and usage
4. Update or delete existing apps

### Static Sites
1. Click on the "🌐 Static Sites" tab
2. Create sites with custom subdomains
3. Deploy from local directories
4. Manage all your hosted sites

## Known Limitations

⚠️ **File Operations Not Available**
File management commands (ls, mkdir, rm, etc.) are not supported on Windows due to a known bug in the Puter CLI interactive shell. Please use the Puter web interface at https://puter.com for file operations.

## Project Structure

```
puter-cli-gui-client/
├── server.js              # Express server with API endpoints
├── puter-gui-v2.html      # Main HTML interface
├── puter-gui-v2.js        # Client-side JavaScript
├── package.json           # Node.js dependencies
├── .env                   # Environment variables (optional)
└── README.md             # This file
```

## API Endpoints

### Authentication
- `POST /api/login` - Login to Puter
- `POST /api/logout` - Logout from Puter
- `GET /api/whoami` - Get current user info

### Workers
- `POST /api/worker/create` - Create and deploy a worker
- `GET /api/workers` - List all workers
- `GET /api/worker/:name` - Get worker info
- `DELETE /api/worker/:name` - Delete a worker

### Applications
- `POST /api/app/create` - Create an app
- `GET /api/apps` - List all apps
- `POST /api/app/update` - Update an app
- `DELETE /api/app` - Delete an app

### Sites
- `POST /api/site/create` - Create a static site
- `POST /api/site/deploy` - Deploy a site
- `GET /api/sites` - List all sites
- `DELETE /api/site` - Delete a site

### Other
- `GET /api/disk-usage` - Get disk usage
- `GET /api/usage` - Get usage statistics
- `POST /api/execute` - Execute a Puter CLI command

## Technologies Used

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Puter SDK**: @heyputer/puter.js
- **File Upload**: Multer
- **CORS**: cors
- **Environment**: dotenv

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT

## Links

- [Puter Platform](https://puter.com)
- [Puter CLI](https://github.com/HeyPuter/puter-cli)
- [Puter.js SDK](https://docs.puter.com)
- [Puter Documentation](https://developer.puter.com)

## Support

For issues related to:
- **This GUI**: Open an issue in this repository
- **Puter CLI**: Visit https://github.com/HeyPuter/puter-cli/issues
- **Puter Platform**: Contact support at https://puter.com

---

**Powered by Puter** - https://developer.puter.com

