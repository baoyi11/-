import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { spawn } from 'child_process';
import path from 'path';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// FastAPI 后端端口
const PYTHON_PORT = 8000;

/**
 * 启动 Python FastAPI 后端服务
 */
function startPythonBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const backendDir = path.resolve(process.cwd(), 'backend');
    const pythonCmd = process.env.PYTHON_CMD || 'python3';

    console.log(`[Server] Starting Python backend on port ${PYTHON_PORT}...`);
    const py = spawn(
      pythonCmd,
      ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', String(PYTHON_PORT)],
      {
        cwd: backendDir,
        stdio: 'pipe',
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      }
    );

    let stdoutBuf = '';
    let stderrBuf = '';

    py.stdout?.on('data', (data: Buffer) => {
      stdoutBuf += data.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() || '';
      lines.forEach((line) => {
        if (line.trim()) console.log(`[Python] ${line}`);
      });
    });

    py.stderr?.on('data', (data: Buffer) => {
      stderrBuf += data.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() || '';
      lines.forEach((line) => {
        if (line.trim()) console.error(`[Python] ${line}`);
      });
    });

    py.on('error', (err) => {
      console.error('[Server] Failed to start Python backend:', err.message);
      reject(err);
    });

    py.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[Server] Python backend exited with code ${code}`);
      }
    });

    // 等待 Uvicorn 启动成功
    const checkInterval = setInterval(() => {
      if (stdoutBuf.includes('Uvicorn running') || stderrBuf.includes('Uvicorn running')) {
        clearInterval(checkInterval);
        console.log('[Server] Python backend is ready.');
        resolve();
      }
    }, 300);

    // 超时处理
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!stdoutBuf.includes('Uvicorn running') && !stderrBuf.includes('Uvicorn running')) {
        console.warn('[Server] Python backend start timeout. stdout:', stdoutBuf.slice(0, 200), 'stderr:', stderrBuf.slice(0, 200));
      }
      resolve();
    }, 15000);
  });
}

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // 生产环境或开发环境都尝试启动 Python 后端
  try {
    await startPythonBackend();
  } catch {
    console.warn('[Server] Python backend not available, API calls will fail.');
  }

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
});
