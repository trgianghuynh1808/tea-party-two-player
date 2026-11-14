import { defineRoom, defineServer } from "colyseus";
import { ROOM_NAME, SERVER_PORT } from "@boba/shared";
import { BobaShopRoom } from "./rooms/BobaShopRoom.js";

const port = Number(process.env.PORT) || SERVER_PORT;

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(BobaShopRoom),
  },
});

server.listen(port);
console.log(`[BobaShop] Colyseus server listening on ws://localhost:${port}`);
