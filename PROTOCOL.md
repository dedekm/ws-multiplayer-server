# Relay protocol

The contract between the relay (this repo), the phone page (`public/`) and a game client. Sections 1-7 describe the code as it is today. Section 8 is the only part that is not implemented, and it is labelled as such.

Sources: `ws/websocket_server.js`, `utils/players_manager.js`, `public/javascripts/base.js` and `public/javascripts/joystick.js`. For setup and environment variables see [README.md](README.md).

All messages are JSON in UTF-8 text frames. A message sent to the relay that is larger than 4096 bytes closes the socket (section 6). Messages the relay sends can be larger (section 2.2).

## 1. Overview

The relay is one HTTP server (Express serves the phone page) with one WebSocket endpoint on the same port. Two kinds of clients connect to it:

| Client | URL | Count |
| --- | --- | --- |
| Phone (controller) | `ws(s)://<host>/` | any number |
| Game | `ws(s)://<host>/?game=<GAME_TOKEN>` | one at a time |

- A connection is a game connection if and only if its query string has a `game` key (`?game`, `?game=` and `?game=x` all count). The URL path is not checked.
- If the environment variable `GAME_TOKEN` is non-empty on the relay, the value of `game` must equal it; otherwise the relay closes the socket with 1008. If `GAME_TOKEN` is empty or unset, the game channel is unauthenticated and anyone can take it over (the relay warns about this at startup).
- A second game connection replaces the first one: the relay closes the old one with 4000 (section 6).
- Every phone socket gets a random public `id` (`crypto.randomUUID()`) when it connects. The relay uses it in every message to the game. The phone is not told its own `id`.
- The relay keeps no game state. Per player it stores the socket and the `data` object from `create`, nothing else (no input, no colour).
- The relay itself speaks plain `ws`. `wss` is the job of a reverse proxy in front (the phone page picks `wss:` on an HTTPS page).

## 2. Messages

### 2.1 Phone to relay

`create`, sent once right after the socket opens:

```json
{"event":"create","data":{}}
```

- `event`: string, required.
- `data`: object with free-form player attributes. The stock page sends `{}`. The relay stores it and copies its fields into the `create` it sends to the game, including every replayed `create` (section 5).

`update`, sent while the input changes, up to 30 times per second (plus the occasional `ping`):

```json
{"event":"update","input":{"x":0.5}}
{"event":"update","input":{"x":0,"y":-0.3}}
{"event":"update","input":{"ping":true}}
```

- `input`: object with only the keys that changed, out of `x`, `y` and `ping`. Meaning and ranges are in section 3.

Anything else from a phone is dropped without closing the socket: text that is not JSON, JSON that is not an object with a string `event`, an unknown `event` (logged), a duplicate `create`, an `update` before `create`. Other keys next to `event`, `data` and `input` are ignored.

### 2.2 Relay to game

```json
{"event":"create","id":"3f6c1a8e-0b7d-4f0e-9c52-8a1d2e7b6c40"}
{"x":0.5,"event":"update","id":"3f6c1a8e-0b7d-4f0e-9c52-8a1d2e7b6c40"}
{"ping":true,"event":"update","id":"3f6c1a8e-0b7d-4f0e-9c52-8a1d2e7b6c40"}
{"event":"destroy","id":"3f6c1a8e-0b7d-4f0e-9c52-8a1d2e7b6c40"}
{"event":"replay_done"}
```

| Event | Shape | Sent when |
| --- | --- | --- |
| `create` | `{...data, event:"create", id}` | A player sent `create`, and once per current player on every game connect (section 5). |
| `update` | `{...input, event:"update", id}` | A player sent `update`. Only the changed keys of `input` are present. |
| `destroy` | `{event:"destroy", id}` | The socket of a player that had sent `create` closed, for any reason. |
| `replay_done` | `{event:"replay_done"}` | After the `create` replay on every accepted game connect, also when there are no players. It has no `id`. Never sent to phones or to a rejected game socket. |

`event` and `id` are always set by the relay, after the phone's fields are copied in, so a phone cannot forge them: `{"event":"update","input":{"id":"x","event":"destroy"}}` still arrives as an `update` with the sender's own `id`. All other fields (the contents of `data` and `input`) are passed through unvalidated today: any key, any type, as long as the phone's message stays within 4096 B. The game must treat them as untrusted input. Whitelisting and clamping is planned (section 8). A non-object `data` or `input` is not rejected either; it is spread as JavaScript does (a string becomes index keys, see the size note below; a number or `null` adds nothing).

The relay sends player events only while a game connection is open. It does not queue them. A `create` is still remembered and reaches the game in the replay; an `update` or `destroy` sent while no game is connected is lost.

Size: the relay parses each message and writes a new one, so relay to game messages are not bounded by 4096 B. `event` and `id` add about 60 B. The worst case is a string `data` or `input`, which the relay spreads into one key per character, about 11 B each (`"1234":"a",`). A 4096 B `create` with a string `data` reached the game as 43700 B (4070 keys) in a local check, and an `update` with a string `input` as 43689 B, so assume about 44 KB for a 4096 B phone message. `data` is stored, so every replay (section 5) sends the large `create` again. A smaller effect: a number literal can grow when it is written back. `1e20` (4 characters) becomes `100000000000000000000` (21 characters), and a 4094 B `update` made of 812 such numbers reached the game as 17932 B. Game to phone messages are re-serialised as well; the game's message is an object, so only number literals grow there. The game client's inbound buffer must therefore hold a single message of about 44 KB. Some WebSocket libraries default to 64 KiB, which is enough; a buffer configured below about 44 KB is not.

Forward compatibility: the game must ignore events and fields it does not know. Section 8 describes a planned `resume` event and a `name` field.

### 2.3 Game to relay

```json
{"id":"3f6c1a8e-0b7d-4f0e-9c52-8a1d2e7b6c40","event":"set_color","color":"#ff0000"}
{"id":"3f6c1a8e-0b7d-4f0e-9c52-8a1d2e7b6c40","event":"failure"}
```

The relay takes `id`, removes it and forwards the rest of the message, as JSON, to the phone with that `id`. It does not look at `event` or any other field. There is no reply and no error: invalid JSON, a message without a truthy `id`, an unknown `id` and a phone whose socket is no longer open are all dropped silently.

Events the phone page handles (section 2.4):

- `set_color`: `color` is a CSS colour string, e.g. `"#ff0000"`.
- `failure`: no fields. The phone shows its failure screen and closes its own socket, which makes the relay send `destroy` for that player (section 4).

### 2.4 Relay to phone

The phone receives the game's message re-serialised (section 2.2 on size), minus `id`. The relay sends a phone nothing else today. The page (`onMessage` in `joystick.js`) handles:

| Event | Fields | Phone does |
| --- | --- | --- |
| `set_color` | `color` | Sets the background of its colour dot to `color`. |
| `failure` | none | Closes its socket (no status code, see section 6), hides the game screen, shows "Failure!" with a "Try again" button that reloads the page. |

Any other event is logged to the browser console (`unhandled event: ...`) and ignored.

## 3. Input conventions

| Key | Type | Range | Meaning |
| --- | --- | --- | --- |
| `x` | number | -1 to 1 | `+` is right on the phone screen. |
| `y` | number | -1 to 1 | `+` is up on the phone screen (towards the top of the page), `-` is down. |
| `ping` | boolean | `true` only | One-shot event, not a held state. |

Where the numbers come from (`public/javascripts/joystick.js` and the vendored `joystick-controller`):

- Joystick: the knob offset from the pad centre is clipped to 45 px, rounded to whole pixels, scaled to integer levels -10 to 10 (`round(offset / 45 * 10)`) and divided by 10. So `x` and `y` move in steps of 0.1. The library returns screen-down as a negative `y` (it negates the pointer's `clientY` delta), so `y` points up on screen. The clip is circular, so the joystick vector stays inside the unit circle, up to rounding.
- Keyboard (desktop testing): `ArrowRight` / `ArrowLeft` give `x` = +1 / -1, `ArrowUp` / `ArrowDown` give `y` = +1 / -1. A non-zero keyboard value overrides the joystick for that axis only; if both keys of one axis are held, the keyboard value is 0 and the joystick value is used for that axis. Diagonal keyboard input therefore has magnitude about 1.41, joystick input at most about 1. A game that wants equal speed must normalise or clamp.
- The y axis is "up is positive", the opposite of screen and canvas coordinates (and of many 2D engines), where y grows downward. A 3D game whose forward axis is -Z maps it to `(x, 0, -y)`. The page does not take the phone's orientation into account.

Sending rules (`sendInput` in `joystick.js`):

- The page samples its input every 1000/30 ms and sends an `update` only when something differs from the previous sample, containing only the keys that differ. The game must therefore keep the last `x` and `y` per player and apply each `update` on top of them. A key that is missing means "unchanged", not zero.
- A player's input is `x = 0, y = 0` until the first change. The page sends nothing at join, and a released joystick sends the change back to 0.
- The relay stores no input. After a game (re)connect the game cannot know any player's current `x` and `y`: the replay (section 5) carries none, and a player may have pushed or released the stick while the game was disconnected. So the game resets the stored `x` and `y` of a player to 0 on every `create`, including a replayed `create` for an `id` it already knows (it keeps the player and resets only the input). A player who is still holding the stick then stands still until the value next changes. Storing and replaying the last input is planned (section 8); until it lands, this rule is the contract.
- `ping` is a separate `update` with `input: {"ping":true}`. The page never sends `ping: false`, so the game must handle each `ping: true` message as an event and not store it. The page lets the button fire once every 3 s (`PING_COOLDOWN`, shown as a countdown). The relay does not enforce that cooldown.

## 4. Lifecycle

Player:

1. A phone connects to `/`. The relay assigns the `id`. Nothing is sent to the game yet, and the socket is not a player yet.
2. The phone sends `create`. The relay registers the player (socket and `data`) and, if a game is connected, sends it `create`. A second `create` on the same socket is ignored.
3. The phone sends `update` messages. They are forwarded while a game is connected and ignored before `create`.
4. The socket closes, with any code or by heartbeat termination. If the socket had sent `create`, the relay removes the player and, if a game is connected, sends `destroy`. A socket that never sent `create` produces nothing.

The stock phone page never reconnects: its `onclose` only logs. A page reload shows the join screen again. The browser closes the old socket when the page unloads, so the game gets a `destroy`. "Try again" after `failure` also reloads the page, but there the page had already closed its socket and the `destroy` went out at failure time (section 2.3). In both cases a new socket with a new `id` and its `create` appear only after the user presses Connect again. Grace windows and reconnect are section 8.

Game:

1. The game connects to `/?game=<GAME_TOKEN>`. A bad token is closed with 1008 before anything else happens, so it cannot disturb the current game connection.
2. If a game connection is already open, the relay closes it with 4000. The new connection becomes the game connection immediately.
3. The relay sends the replay (section 5).
4. From then on player events are forwarded to this connection, and its messages are routed to phones.
5. When the game connection closes, the relay forgets it. The players stay registered, their sockets stay open, and player events are dropped (section 2.2) until a game connects again.

## 5. Game reconnect and replay

On every accepted game connect the relay sends, in this order:

1. one `create` for each currently registered player, with that player's own `id` and stored `data` (the `id` stays the same across replays), then
2. `{"event":"replay_done"}`.

Today both steps are sent back to back, so no other relay message arrives between the first replayed `create` and `replay_done` (the planned change in section 8 would end this guarantee). The order of the `create` messages is not specified.

The replay is the complete set of players that exist right now. Players who left while the game was disconnected got no `destroy`, because there was no game to send it to, and the relay has already forgotten them. Required game behaviour:

- Handle `create` for an `id` it already knows idempotently: keep the existing player, do not spawn a second one, but reset the stored `x` and `y` of that player to 0 (section 3). The replay carries no input and the game cannot know what the player did during the outage; 0 is the neutral value, and the next `update` that changes a key corrects it.
- Treat `replay_done` as "the player set is complete". At that point, drop every player it knows that was not mentioned in the replay (a local removal, as if `destroy` had arrived).
- Do not drop anything before `replay_done` arrives. If the connection closes before the marker, the replay was incomplete, and the next connect starts a new replay.
- `replay_done` is also sent when there are no players, so a game that starts on an empty relay still gets the marker.

## 6. Close codes

| Code | Sent by | When | Client must do |
| --- | --- | --- | --- |
| 1000, 1005 | Phone page; game client | The phone page closes its own socket after `failure` with `close()` and no status code, which the relay's `ws` library reports as 1005 ("no status received"; seen with a Node WebSocket client, not checked in a browser). An explicit 1000 is reported as 1000. A game client's deliberate close usually sends 1000. The relay treats every code the same. | Game: handle the `destroy` that follows a phone close. A deliberate close of the game connection frees the game slot; the game client must not reconnect after a close it started itself. |
| 1001, 1006 | 1001: the browser. 1006: nobody; it is never sent on the wire, the `ws` library on the relay reports it locally. | 1001: the tab is closed or navigates away. 1006: the socket ended without a close frame, i.e. a dropped connection or a heartbeat `terminate()` (section 7). The relay's own log line names no code. | Game: the relay sends `destroy` for a player. When the game's own connection ends this way (no close frame), the client library reports an abnormal close (the code depends on the library) and the game client reconnects with backoff. |
| 1008 | Relay | Reason `invalid url`: the request URL could not be parsed. Reason `invalid game token`: `GAME_TOKEN` is set and the `game` value differs. | Game client: do not reconnect automatically. Fix the URL or token. |
| 1009 | Relay (the `ws` library) | A single message is larger than 4096 bytes (`maxPayload`; exactly 4096 is accepted). | Phone: its socket is closed and the relay sends `destroy`. Game: see below. |
| 4000 | Relay | A newer game connection replaced this one. Reason `replaced by new game connection`, informational only. | Game client: do not reconnect automatically. Two game instances that reconnect after 4000 replace each other in a loop. Match the code only, never the reason text. |

Reconnect rule for a game client: do not reconnect automatically after 4000 or 1008, and not after a close the game started itself. After every other close, reconnect with backoff (a delay that grows after each failed attempt up to a cap, and starts over once a connection is open).

Message size on the game channel: if the game sends a message over 4096 bytes, the relay closes the whole game connection with 1009. That drops the game connection and the relay's game slot until the game client reconnects (with backoff, since 1009 is neither 1008 nor 4000); the reconnect then runs the replay. A game client should refuse to send anything over 4096 B itself. The 4096 B limit applies only to what a client sends to the relay. It does not bound what the relay sends: see the size note in section 2.2.

## 7. Liveness

- The relay pings every connected socket (phones and game) every 15 s. A socket that did not answer the previous ping with a pong by the next one is terminated, which fires the normal close handling (`destroy` for a player, game slot freed). In the worst case the relay notices a silent peer 15 to 30 s after it stopped answering.
- The game client must keep servicing its socket (reading frames, answering pings) at least every 15 s, including while the game is paused (some engines stop per-frame processing when paused). Blocking longer, for example in a debugger pause or in one very long frame or loop iteration, can get the connection terminated; the game client then reconnects and the relay runs a replay.
- A game client may also ping the relay itself (the relay answers automatically) and treat a missing pong as a dead connection. If it does, a stall longer than its timeout can make it close a healthy connection itself (depending on whether it reads waiting frames first), so its timeout should exceed the longest stall it can have.
- A reverse proxy in front of the relay must keep its read/idle timeout above 15 s, or it will cut quiet connections that the heartbeat would have kept alive.

## 8. Planned - not implemented

**Nothing in this section exists in the relay or the phone page yet. Do not code against it.** The shape below is a design note, so that the relay, the phone page and game clients can be built to match.

Resume flow:

- The relay sends the phone `{"event":"welcome","resumeToken":"..."}`. `resumeToken` is random and separate from the public `id` (the `id` is visible to the game and in logs).
- The phone stores the token (`localStorage`) and sends it with `create` when it reconnects. If the token matches a player inside the grace window, the relay resumes that player's `id`; otherwise it mints a new one. A client can never choose its public `id`.
- The grace window applies only to abnormal closes (1001, 1006). A clean 1000 still sends `destroy` at once, e.g. the phone closing after `failure`. The stock page's `close()` currently arrives as 1005 (section 6), so "clean" has to include 1005, or the page has to pass an explicit 1000.
- During the window, game to player messages are dropped and `destroy` is withheld.
- On resume the relay sends the game `{"event":"resume","id":"..."}` and the game re-sends that player's state: `set_color`, and `failure` if it applies. The relay does not cache `set_color`, to stay thin.
- After each `create` it sends to the game (replayed ones included) and after `resume`, the relay replays the stored last input of that player as an `update`. Until that lands, the game resets the input to 0 on `create` (sections 3 and 5); the replayed `update` follows the `create` and overwrites that 0. Those `update`s are sent during the replay, between the replayed `create`s and `replay_done`, so the guarantee in section 5 that nothing arrives between the first replayed `create` and `replay_done` no longer holds then.
- Players inside the grace window are included in a game replay: their `destroy` is withheld, so they still exist.

Other planned protocol changes:

- Validation: outgoing messages built from whitelisted fields (`x` and `y` finite and clamped to [-1, 1], `ping` boolean); unknown events and keys are dropped.
- Limits: a cap on the number of players and a per-socket rate limit on `update`; the relay closes offenders with 1008.
- `name` in `create`: the nickname entered on the join screen, validated like the other fields.
- `game_status`: `{"event":"game_status","connected":true}` sent to phones on connect and whenever the game connects or disconnects.
