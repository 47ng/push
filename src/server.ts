import path from 'path'
import checkEnv from '@47ng/check-env'
import { createServer, Server } from 'fastify-micro'
import { Redis } from 'ioredis'
import readPkg from 'read-pkg'

export interface App extends Server {
  redis: Redis
}

// --

export default function createApp() {
  checkEnv({
    required: ['REDIS_URI']
  })
  const pkg = readPkg.sync({ cwd: path.resolve(__dirname, '..') })
  const app = createServer<App>({
    name: `push@${pkg.version}`,
    routesDir: path.resolve(__dirname, 'routes'),
    redactEnv: ['REDIS_URI'],
    sentry: {
      release: process.env.COMMIT_ID
    },
    underPressure: {
      exposeStatusRoute: {
        url: '/',
        routeOpts: {
          logLevel: 'silent'
        }
      },
      healthCheck: async (app: App) => {
        try {
          const validStatuses = [
            'connect',
            'ready',
            'connecting',
            'reconnecting'
          ]
          if (!validStatuses.includes(app.redis.status)) {
            throw new Error(`Redis status: ${app.redis.status}`)
          }
          return true
        } catch (error) {
          app.log.error(error)
          app.sentry.report(error)
          return false
        }
      }
    },
    configure: app => {
      app.register(require('./plugins/redis').default)
    }
  })

  app.addHook('onClose', async (_, done) => {
    await app.redis.quit()
    done()
  })

  return app
}
