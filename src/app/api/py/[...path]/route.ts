/**
 * API 代理路由
 * 将所有 /api/py/* 请求转发到 Python FastAPI 后端 (127.0.0.1:8000)
 */

import { NextRequest, NextResponse } from 'next/server';
import http from 'http';

const PYTHON_API_BASE = 'http://127.0.0.1:8000/api';

function proxyWithHttp(
  request: NextRequest,
  method: string,
  bodyBuffer: Buffer | null,
  targetPath: string
): Promise<NextResponse> {
  return new Promise((resolve) => {
    const url = new URL(`${PYTHON_API_BASE}/${targetPath}`);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'host') {
        headers[key] = value;
      }
    });

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
      timeout: 60000,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const chunks: Buffer[] = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const responseBody = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        const hopByHop = ['transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'];
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          if (!hopByHop.includes(key.toLowerCase()) && value !== undefined) {
            if (Array.isArray(value)) {
              responseHeaders.set(key, value.join(', '));
            } else {
              responseHeaders.set(key, String(value));
            }
          }
        });

        resolve(
          new NextResponse(responseBody, {
            status: proxyRes.statusCode || 200,
            statusText: proxyRes.statusMessage || 'OK',
            headers: responseHeaders,
          })
        );
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[API Proxy] HTTP proxy error:', err);
      const isRefused = String(err).includes('ECONNREFUSED');
      resolve(
        NextResponse.json(
          {
            error: 'Python backend unavailable',
            detail: isRefused
              ? '后端分析服务未启动。请检查部署配置中是否已安装 Python 依赖 (pip3 install -r backend/requirements.txt)。'
              : String(err),
          },
          { status: 503 }
        )
      );
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      resolve(
        NextResponse.json(
          { error: 'Python backend timeout' },
          { status: 504 }
        )
      );
    });

    if (bodyBuffer) {
      proxyReq.write(bodyBuffer);
    }
    proxyReq.end();
  });
}

async function proxyRequest(
  request: NextRequest,
  method: string,
  params: { path: string[] }
): Promise<NextResponse> {
  const subPath = params.path.join('/');

  let bodyBuffer: Buffer | null = null;
  if (method !== 'GET' && method !== 'HEAD') {
    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      bodyBuffer = Buffer.from(arrayBuffer);
    }
  }

  return proxyWithHttp(request, method, bodyBuffer, subPath);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, 'GET', await params);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, 'POST', await params);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, 'PUT', await params);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, 'DELETE', await params);
}
