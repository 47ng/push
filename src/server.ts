import path from 'path'
import checkEnv from '@47ng/check-env'
import { createServer, Server } from 'fastify-micro'
import fastifyStatic from 'fastify-static'
import { MetricsDecoration } from './plugins/metrics'
import { RedisDecoration, checkRedisHealth } from './plugins/redis'

export interface App extends Server {
  redis: RedisDecoration
  metrics: MetricsDecoration
}

// --

export default function createApp() {
  checkEnv({
    required: ['REDIS_URI_INGRESS', 'REDIS_URI_RATE_LIMIT']
  })
  const app = createServer<App>({
    name: 'push',
    routesDir: path.resolve(__dirname, 'routes'),
    redactEnv: ['REDIS_URI_INGRESS', 'REDIS_URI_RATE_LIMIT'],
    underPressure: {
      exposeStatusRoute: {
        url: '/',
        routeOpts: {
          logLevel: 'silent'
        }
      },
      healthCheck: async (app: App) => {
        try {
          checkRedisHealth(app.redis.ingress, 'ingress')
          checkRedisHealth(app.redis.rateLimit, 'rate limit')
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
      app.register(require('./plugins/metrics').default)
    }
  })

  app.register(fastifyStatic, {
    root: path.resolve(__dirname, '../public'),
    wildcard: false
  })

  app.addHook('onClose', async (_, done) => {
    await Promise.all([app.redis.ingress.quit(), app.redis.rateLimit.quit()])
    done()
  })

  return app
}
