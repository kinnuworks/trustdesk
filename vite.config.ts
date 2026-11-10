import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** In development, serve the files in /api the way Vercel does in production. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/([a-z]+)/.exec(req.url ?? '')
        if (!m) return next()
        let raw = ''
        for await (const chunk of req) raw += chunk
        ;(req as any).body = raw ? JSON.parse(raw) : {}
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`)
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
})
