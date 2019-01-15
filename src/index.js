const fs = require('fs')
const Express = require('express')
const globals = require('./globals')
const BodyParser = require('body-parser')
const Downloader = require('./downloader')
const JSONReader = require('./jsonreader')
const Playback = require('./playback')
const WebSocketServer = require('simple-websocket/server')

// Configure default settings
console.log('Creating JSONReader - Settings')
globals.settings = JSONReader(globals.SettingsPath)
globals.settings.apiPort = globals.settings.apiPort == undefined ? 8081 : globals.settings.apiPort
globals.settings.websocketPort = globals.settings.websocketPort == undefined ? 8082 : globals.settings.websocketPort
globals.settings.shuffle = globals.settings.shuffle == undefined ? true : globals.settings.shuffle
globals.settings.removeAfterPlay = globals.settings.removeAfterPlay == undefined ? true : globals.settings.removeAfterPlay
globals.settings.save()

// Create instances
const app = Express()
const downloader = new Downloader()
const playback = new Playback(downloader)
const websocket = new WebSocketServer({ port: globals.settings.websocketPort })

sendQueueToAllClients = () =>
{
	let data = {
		type: 'bulk',
		info: {
			queue: [],
			currentSong: playback.currentSong() || {}
		}
	}

	for(let i = 0; i < playback.queue.songs.length; i++)
		data.info.queue.push(downloader.getInfo(playback.queue.songs[i]))

	for(let i = 0; i < websocketConnections.length; i++)
		websocketConnections[i].write(JSON.stringify(data))
}

// Configure websocket
let websocketConnections = []
websocket.on('connection', (socket) =>
{
	websocketConnections.push(socket)
	let bulkData = {
		type: 'bulk',
		info: {
			queue: [],
			currentSong: playback.currentSong() || {}
		}
	}

	for(let i = 0; i < playback.queue.songs.length; i++)
		bulkData.info.queue.push(downloader.getInfo(playback.queue.songs[i]))

	socket.write(JSON.stringify(bulkData))

	socket.on('data', (data) =>
	{
		try { data = JSON.parse(data) } catch(e) { res.end('{ "error": "Invalid data" }'); return; }
		if(data.type == 'pause')
			playback.togglePause(data.value)
		else
			console.log(`Received data - ${data}`)
	})
	socket.on('close', () =>
	{
		let index = websocketConnections.findIndex(x => x._id == socket._id)
		if(index < 0)
			return
		websocketConnections[index].destroy()
		websocketConnections.splice(index, 1)
	})
	socket.on('error', (err) => { console.log(`WebSocket error - ${err}`) })
})

playback.addUpdateCallback(() =>
{
	let data = {
		type: 'update',
		info: playback.currentSong()
	}
	for(let i = 0; i < websocketConnections.length; i++)
		websocketConnections[i].write(JSON.stringify(data))
})

// Set up express app
app.use(BodyParser.json())
app.use(BodyParser.urlencoded({ extended: true }))
app.use('/music', Express.static(downloader.outputPath))
app.use('/client', Express.static(`${__dirname}/../web_client`))

// Current song object
// {
//		id: YouTube video ID
//		path: Path to audio file (e.g. 'music/UglrFGiS3f0.mp3')
//		durationTotal: Overall length of song
//		durationRemaining: Length left of song
//		playbackBegan: What time the song started, used to calculate durationRemaining
// }
app.get('/api/Songs/Current', (req, res) => { res.end(JSON.stringify(playback.currentSong() || {})) })

// Media controls
app.post('/api/Songs/Next', (req, res) => { playback.next(); res.end('success') })
app.post('/api/Songs/Prev', (req, res) => { playback.prev(); res.end('success') })
app.post('/api/Songs/TogglePause', (req, res) => { playback.togglePause(); res.end(playback.isPlaying() ? 'play' : 'pause') })
app.post('/api/Songs/Seek', (req, res) =>
{
	if(!req.query.length)
	{
		res.end('{ "error": "\'length\' parameter required" }')
		return
	}
	if(isNaN(req.query.length))
	{
		res.end('{ "error": "\'length\' parameter needs to be a number" }')
		return
	}

	let seconds = playback.currentSong().durationTotal - req.query.length
	let minutesLeft = Math.floor(seconds / 60)
	let secondsLeft = Math.floor(seconds % 60)
	console.log(`Seeking to ${minutesLeft}:${secondsLeft < 10 ? ('0' + secondsLeft) : secondsLeft}`)

	playback.seek(req.query.length)
	res.end('success')
})
app.post('/api/Songs/Change', (req, res) =>
{
	if(!req.query.index)
	{
		res.end('{ "error": "\'index\' parameter required" }')
		return
	}
	if(isNaN(req.query.index))
	{
		res.end('{ "error": "\'index\' parameter needs to be a number" }')
		return
	}
	playback.changeSong(Number(req.query.index))
	res.end('success')
})

app.get('/api/Songs/Info', (req, res) => {
	let videoID = req.query.videoID
	if(!downloader.isValidVideoID(videoID))
	{
		res.end('{ "error": "Invalid video ID" }')
		return
	}
	if(!downloader.songDownloaded(videoID))
	{
		res.end('{ "error": "Song not found" }')
		return
	}
	res.end(JSON.stringify(downloader.getInfo(videoID)))
})

app.get('/api/Queue/List', (req, res) =>
{
	let response = []
	for(let i = 0; i < playback.queue.songs.length; i++)
		response.push(req.query.expand ?
						downloader.getInfo(playback.queue.songs[i]) :
						playback.queue.songs[i]
					)

	response = response.filter(x => x != undefined)
	res.end(JSON.stringify(response))
})

app.post('/api/Queue/Add', (req, res, next) =>
{
	if(!req.query.videoID)
	{
		console.log('No video ID during \'QueueAdd\' POST')
		return
	}
	if(!downloader.isValidVideoID(req.query.videoID))
	{
		console.log(`Trying to download invalid video ID '${req.query.videoID}'`)
		return
	}
	console.log(`Adding '${req.query.videoID}'...`)

	res.end('success')
	downloader.download(req.query.videoID, {
		finished: (data) =>
		{
			console.log(`Added '${data.videoId}' to queue`)
			playback.queue.songs.push(data.videoId)
			playback.queue.save()
			sendQueueToAllClients()

			if(playback.queue.songs.length == 1) // song we just added
				playback.changeSong(0) // start playing
		}
	})
})

let server = app.listen(globals.settings.apiPort, () =>
{
	let port = server.address().port
	console.log(`Music server API listening on port ${port}`)
	console.log(` Download Directory: ${globals.MusicPath.replace(/\\/g, '/')}`)
	console.log(` Queued Songs: ${playback.queue.songs.length}`)
	console.log()
	console.log(` Settings:`)
	console.log(`\tShuffle: ${globals.settings.shuffle ? 'Yes' : 'No'}`)
	console.log(`\tWebSocket Port: ${globals.settings.websocketPort}`)
	console.log(`\tRemove After Playback: ${globals.settings.removeAfterPlay ? 'Yes' : 'No'}`)
	console.log()

	playback.changeSong(playback.currentSongIndex)
})
