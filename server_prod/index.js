import { createApp } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT || 5173);

app.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`Kifekoi prod server listening on http://localhost:${port}`);
});

