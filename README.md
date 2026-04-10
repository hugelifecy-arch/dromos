# Dromos - Taxi Ride Resale Marketplace

A secure peer-to-peer marketplace for buying and selling pre-booked taxi rides. Built with security-first architecture featuring encrypted transactions, JWT authentication, and ride verification.

## Features

- **Ride Listing & Discovery** - Browse and search available rides by route, time, and price
- - **Secure Transactions** - End-to-end encrypted payment processing via Stripe
  - - **User Authentication** - JWT-based auth with refresh token rotation and bcrypt password hashing
    - - **Ride Verification** - QR code based ride transfer verification between seller and buyer
      - - **Real-time Updates** - WebSocket notifications for ride status changes and new listings
        - - **Rating System** - Trust-based rating system for buyers and sellers
          - - **Geolocation** - Map integration for pickup/dropoff visualization
           
            - ## Tech Stack
           
            - - **Backend:** Node.js, Express.js, TypeScript
              - - **Database:** PostgreSQL with Prisma ORM
                - - **Cache:** Redis for session management and rate limiting
                  - - **Auth:** JWT with refresh tokens, bcrypt, Helmet.js
                    - - **Payments:** Stripe API
                      - - **Real-time:** Socket.io
                        - - **Maps:** Google Maps / Mapbox API
                          - - **Testing:** Jest, Supertest
                            - - **CI/CD:** GitHub Actions
                             
                              - ## Project Structure
                             
                              - ```
                                dromos/
                                ├── src/
                                │   ├── config/          # App configuration and env validation
                                │   ├── controllers/     # Route handlers
                                │   ├── middleware/       # Auth, validation, rate limiting, error handling
                                │   ├── models/          # Database models / Prisma schema
                                │   ├── routes/          # API route definitions
                                │   ├── services/        # Business logic layer
                                │   ├── utils/           # Helpers, encryption, validators
                                │   ├── websockets/      # Real-time event handlers
                                │   └── app.ts           # Express app setup
                                ├── prisma/              # Database schema and migrations
                                ├── tests/               # Test suites
                                ├── .env.example         # Environment variable template
                                ├── .gitignore
                                ├── SECURITY.md
                                ├── LICENSE
                                └── README.md
                                ```

                                ## Getting Started

                                ### Prerequisites

                                - Node.js >= 18.x
                                - - PostgreSQL >= 14
                                  - - Redis >= 7
                                    - - Stripe account (for payments)
                                     
                                      - ### Installation
                                     
                                      - 1. Clone the repository
                                        2. 2. Copy `.env.example` to `.env` and configure your variables
                                           3. 3. Install dependencies: `npm install`
                                              4. 4. Run database migrations: `npx prisma migrate dev`
                                                 5. 5. Seed the database: `npm run seed`
                                                    6. 6. Start development server: `npm run dev`
                                                      
                                                       7. ## API Endpoints
                                                      
                                                       8. | Method | Endpoint | Description |
                                                       9. |--------|----------|-------------|
                                                       10. | POST | /api/v1/auth/register | User registration |
                                                       11. | POST | /api/v1/auth/login | User login |
                                                       12. | POST | /api/v1/auth/refresh | Refresh access token |
                                                       13. | GET | /api/v1/rides | List available rides |
                                                       14. | POST | /api/v1/rides | Create ride listing |
                                                       15. | GET | /api/v1/rides/:id | Get ride details |
                                                       16. | POST | /api/v1/rides/:id/purchase | Purchase a ride |
                                                       17. | POST | /api/v1/rides/:id/verify | Verify ride transfer |
                                                       18. | GET | /api/v1/users/profile | Get user profile |
                                                       19. | PUT | /api/v1/users/profile | Update user profile |
                                                       20. | GET | /api/v1/transactions | Transaction history |
                                                      
                                                       21. ## Security
                                                      
                                                       22. This project follows security best practices. See [SECURITY.md](SECURITY.md) for details.
                                                      
                                                       23. Key security measures include: JWT authentication with token rotation, input validation on all endpoints, rate limiting, encrypted data at rest and in transit, CORS restrictions, HTTP security headers via Helmet.js, CSRF protection, and parameterized database queries.
                                                      
                                                       24. ## License
                                                      
                                                       25. This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
