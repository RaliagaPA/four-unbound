# Four Unbound — multiplayer data model (stage 1: lobby only)

This is a **proposal in a separate branch**, not deployed Firebase rules. The existing game in `index.html` stays unchanged.

## Fixed room slots

The database has exactly three paths: `/rooms/1`, `/rooms/2`, `/rooms/3`. A client selects an empty slot using a transaction and generates a four-digit `code`. Code uniqueness is checked against the other slots by the rules. Clients sign in using Firebase Anonymous Authentication before reading or writing any room. The code is a **joining identifier, not an access-control secret**: any authenticated client can inspect the three slots. Avoid real names and private data.

Example room (timestamps are Firebase server timestamps, in milliseconds):

```json
{
  "code": "0042",
  "hostUid": "firebase-auth-uid",
  "status": "lobby",
  "boardSize": "7x6",
  "turnOrder": "fifo",
  "createdAt": 1795740000000,
  "lastActivityAt": 1795740000000,
  "seats": {
    "1": { "uid": "firebase-auth-uid", "name": "Jugador 1", "color": 0, "joinedAt": 1795740000000 }
  }
}
```

Each subsequent participant reserves one of seats `2`, `3`, or `4` via a transaction, sets a default name (`Jugador 2`, etc.), and chooses one of 12 distinct colors (stored as indices `0..11`). Changes to name/color are permitted to the seat owner while the room is in lobby. Only the host may change `boardSize` and `turnOrder` while in lobby.

## Lifecycle and permissions

- The host creates the room and reserves seat 1. Lobby clients subscribe to its slot for updates. Members may update their own seat; guests leaving a lobby remove their seat.
- The host's client registers an `onDisconnect().remove()` for the room. Guests register an `onDisconnect().remove()` for their seat. The host closing the connection removes the room (Firebase disconnect detection is not instantaneous).
- `lastActivityAt` begins at creation and is refreshed when a player joins. A connected client may delete a room 10 minutes after that timestamp; a creation attempt can inspect/reap expired slots. **Without scheduled server code, the deletion is not guaranteed to happen exactly at 10 minutes if no clients are present.**
- Game start, move validation, game-state synchronization and in-progress disconnect handling are **not enabled by these initial rules**. The next stage must extend the model and rules *before* exposing the online UI. Do not deploy these draft rules yet.

## Security notes

- Deny-by-default for all paths except three lobby slots. Room creation is checked for authenticated host UID and unique four-digit code; seat edits require an authenticated seat owner. A fixed seat range prevents a fifth player.
- `lastActivityAt` may be updated by any current room member; this is a practical prototype choice, **not a server-enforced proof that a player actually joined**. In particular, a modified client could extend a room's lifetime.
- Server-side presence (`onDisconnect`) is best effort, especially for unstable mobile connections. A connection drop may close a room even if the browser remains open.
- Real-time play cannot be made cheat-proof with client-side checks alone. We will decide precisely how strictly to enforce legal moves before enabling game-state writes.

## Verification status

JSON syntax and structural invariants can be checked locally. These draft rules have **not** yet been run in Firebase Emulator or `Rules playground`, and have **not** been applied to the live project.