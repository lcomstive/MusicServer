# Music Server
The collaborative music queue

With *Music Server* you can host a single Node server and stream music to multiple devices at once,
each being able to control music or add to the queue - syncing across all other clients.

## Technology
#### Server
A [NodeJS](https://nodejs.org/en/) backend for hosting an API and websocket connection,
which also downloads music that can be streamed to the clients.

Music is not streamed over a websocket, but rather using a HTML `<audio>` element for simplification.

#### Client
A website hosted by the server, using a websocket to keep up-to-date with the queue and current song
state (*e.g. paused, seek position*).

## Requirements
 - [NodeJS](https://nodejs.org/en/)

## License
This project uses the [MIT](./LICENSE) license
