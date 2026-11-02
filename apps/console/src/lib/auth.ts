import { betterAuth } from "better-auth";

import { db } from "./db";

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ??
    "https://console.kiyt.io",

  trustedOrigins: [
    "https://console.kiyt.io",
  ],

  database: db,

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: true,
        input: true,
      },

      lastName: {
        type: "string",
        required: true,
        input: true,
      },
    },
  },
});
