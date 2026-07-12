const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'YorFinance API',
      version: '1.0.0',
      description: 'API untuk manajemen subscription YorFinance Bot',
      contact: {
        name: 'YorFinance',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Admin API Key untuk autentikasi',
        },
      },
      schemas: {
        Subscription: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cmr1234567890',
            },
            plan: {
              type: 'string',
              example: 'basic',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED'],
              example: 'PENDING',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-08-11T12:00:00.000Z',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cmr1234567890',
            },
            email: {
              type: 'string',
              example: 'budi@gmail.com',
            },
            name: {
              type: 'string',
              example: 'Budi',
            },
          },
        },
        CreateSubscriptionRequest: {
          type: 'object',
          required: ['email'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'budi@gmail.com',
            },
            name: {
              type: 'string',
              example: 'Budi',
            },
            plan: {
              type: 'string',
              default: 'basic',
              example: 'basic',
            },
            durationDays: {
              type: 'integer',
              default: 30,
              example: 30,
            },
          },
        },
        CreateSubscriptionResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Subscription berhasil dibuat. Kode redeem telah dikirim ke email.',
            },
            redeemCode: {
              type: 'string',
              example: 'A3K9M2',
            },
            user: {
              $ref: '#/components/schemas/User',
            },
            subscription: {
              $ref: '#/components/schemas/Subscription',
            },
          },
        },
        RedeemCodeResponse: {
          type: 'object',
          properties: {
            subscriptionId: {
              type: 'string',
              example: 'cmr1234567890',
            },
            redeemCode: {
              type: 'string',
              example: 'A3K9M2',
            },
            status: {
              type: 'string',
              example: 'PENDING',
            },
            plan: {
              type: 'string',
              example: 'basic',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
            },
            user: {
              $ref: '#/components/schemas/User',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
            },
            detail: {
              type: 'string',
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
