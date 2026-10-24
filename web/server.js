/**
 * Demarrage du site sur o2switch (cPanel « Setup Node.js App », Passenger).
 *
 * Passenger lance ce fichier et lui confie le port ; on sert l'application
 * Next deja construite (`npm run build`), en production. En local, on garde
 * `npm run dev` / `npm start`.
 */
const { createServer } = require("node:http");
const next = require("next");

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Sur-MeZur web pret sur le port ${port}`);
  });
});
