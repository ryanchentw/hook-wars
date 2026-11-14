# How to deploy Hook Wars to Fly.io

One service serves the built page and runs every room. The steps below put it on one small machine in Tokyo. Nothing in this repository has been deployed, and `fly.toml` holds a placeholder app name.

You need the [Fly CLI](https://fly.io/docs/flyctl/install/) and, to try the image first, Docker.

## Try the image on your own machine

1. Build the image from the repository root.

	```sh
	docker build -t hook-wars .
	```

2. Run it.

	```sh
	docker run --rm -p 8080:8080 hook-wars
	```

3. Open `http://localhost:8080`, create a room, and open the link it gives you in a second browser window. `http://localhost:8080/healthz` answers `{"ok":true,"rooms":1,"matches":0,"connections":2}`.

To run the same service without Docker, use `pnpm build` and then `pnpm start`. `pnpm start` listens on port 8787 unless `PORT` says otherwise.

## Deploy

1. Sign in.

	```sh
	fly auth login
	```

2. Pick an app name. App names are shared by everyone on Fly, so a short name like `hook-wars` may already be taken. Create the app, and put the same name in the `app` line of `fly.toml`.

	```sh
	fly apps create your-app-name
	```

3. Deploy one machine. Without `--ha=false` Fly starts two, and two machines do not share rooms.

	```sh
	fly deploy --ha=false
	```

4. Check that it is up.

	```sh
	fly status
	curl https://your-app-name.fly.dev/healthz
	```

5. Open `https://your-app-name.fly.dev`, create a room, and send the link to a friend.

## Deploy a new version

A deploy restarts the machine, and the rooms are in its memory. Every player in a match is sent back to the menu with "The server restarted and the room was closed." Deploy when nobody is playing.

```sh
curl https://your-app-name.fly.dev/healthz   # "rooms":0 means nobody is in a room
fly deploy --ha=false
```

## Choose the region

`primary_region = "nrt"` is Tokyo. Hong Kong (`hkg`) is nearer to Taiwan on the map and may answer faster. Neither has been measured from Taiwan for this project. To compare them, deploy to each in turn and read the ping beside "Online" at the top right of the lobby from each player's home connection.

```sh
fly platform regions                       # the regions your account may use
fly deploy --ha=false --primary-region hkg
```

To keep a region, change `primary_region` in `fly.toml`.

## Decide whether the machine may sleep

`fly.toml` lets the machine stop when nobody has the page open (`auto_stop_machines = "stop"`, `min_machines_running = 0`) and start again on the next visit. An open WebSocket counts as load, so the machine stays awake while anyone is in a room. The first visitor after a quiet spell waits for the machine to start.

If a match ever ends for everyone with "The server restarted and the room was closed" and `fly logs` shows `server.stopping` with no deploy, the machine was stopped under a room. Keep it running instead, which costs a few US dollars a month for this machine size.

```toml
auto_stop_machines = "off"
min_machines_running = 1
```

## Watch the CPU

The machine's limit is CPU, not memory. On a laptop, one 3v3 with six players who never stop moving used 11% of one core, and the idle service used 89 MB of memory. A shared Fly CPU is slower than a laptop core, and Fly slows a shared machine that stays busy. How many rooms the machine holds has not been measured on Fly.

After the first evening of play, look at the CPU graph in the Fly dashboard for the machine. If the graph sits near its ceiling during a match, or players report that everyone stutters at once, do one of the following.

- Turn compression off. The service then uses about 40% less CPU, and sends each player ten times the data: 98 kB per second, not 9. Set `HOOKBRAWL_WS_COMPRESSION = "false"` in `[env]`.
- Send fewer snapshots. Set `HOOKBRAWL_SNAPSHOT_HZ = "15"` in `[env]`.
- Use a machine with a CPU of its own. Set `size = "performance-1x"` in `[[vm]]`, which costs more.

`pnpm --filter @hookbrawl/server exec tsx bench/wire.ts` repeats the laptop measurement after `pnpm build`.

## Read the logs

```sh
fly logs
```

Each line is one JSON object. The logs hold counts and events: no names, no addresses, no room codes.

| Event | Meaning |
|---|---|
| `server.listening` | The service is up. |
| `room.opened`, `room.closed` | A room was created, or was forgotten after everyone left. `rooms` is how many remain. |
| `room.enter` | Someone joined or rejoined. `ok` is false when the room refused them. |
| `room.dropped` | A player's connection dropped. Their seat is held for 60 seconds. |
| `message.refused` | A client sent something the protocol does not allow, and was disconnected. |
| `server.stopping` | The service was told to stop, and has told every player. |

## Change a setting

Every setting is an environment variable with a default, checked when the service starts. The service refuses to start on a value that is out of range, and says which. `apps/server/src/config.ts` lists all of them. Set one in the `[env]` section of `fly.toml`, then deploy.

| Variable | Default | What it does |
|---|---|---|
| `HOOKBRAWL_MAX_ROOMS` | 40 | Rooms the machine holds before it refuses to create more. |
| `HOOKBRAWL_REJOIN_WINDOW_MS` | 60000 | How long a dropped player keeps their seat. |
| `HOOKBRAWL_MATCH_COUNTDOWN_MS` | 3500 | Time between "Start match" and the first tick. |
| `HOOKBRAWL_SNAPSHOT_HZ` | 20 | Snapshots sent to each player per second. |
| `HOOKBRAWL_WS_COMPRESSION` | true | Whether messages are compressed. Compression trades CPU for bandwidth. |
| `HOOKBRAWL_ALLOWED_ORIGINS` | unset | Sites allowed to open a room connection. Unset, only the site that served the page. Set it if you serve the page from another domain. |

## Do not add a second machine

Rooms live in one machine's memory. With two machines, a friend who opens your link can reach the machine that does not have your room and be told that the room does not exist. `fly scale count 1` returns to one machine.
