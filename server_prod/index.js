import { createApp } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT || 5173);

// Railway (and most PaaS) require binding to 0.0.0.0.
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Kifekoi prod server listening on http://localhost:${port}`);
});
