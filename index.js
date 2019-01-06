const fs = require('fs')
const Express = require('express')
const BodyParser = require('body-parser')
const YoutubeMP3Downloader = require('youtube-mp3-downloader')
const FFMPEGBinaries = require('ffmpeg-binaries')

const QueuePath = `${__dirname}/queue.json`
const MusicPath = `${__dirname}/music`

const app = Express()
app.use(BodyParser.json())
app.use(BodyParser.urlencoded({ extended: true }))

const yt = new YoutubeMP3Downloader({
	ffmpegPath: FFMPEGBinaries,
	outputPath: MusicPath,
	youtubeVideoQuality: 'highest',
	queueParallelism: 2,
	progressTimeout: 2000
})

if(!fs.existsSync(MusicPath))
	fs.mkdirSync(MusicPath)

/*
yt.download('k0QOkuu3Jog')
yt.on('finished', (err, data) => { console.log(JSON.stringify(data)) })
yt.on('error', (error) => { console.log(error) })
yt.on('progress', (progress) => { console.log(JSON.stringify(progress)) })

fs.exists(QueuePath, (exists) =>
{
	if(!exists)
		fs.writeFile(QueuePath, '{queue:[]}', (err) => {
			if(err)
				throw err
			console.log(`Queue created at '${QueuePath}'`)
		})
	setupServer()
})
*/

setupServer = () =>
{
	app.get('/api/QueueList', (req, res) => { fs.readFile(QueuePath, 'utf8', (err, data) => { res.end(data) }) })

	app.post('/api/QueueAdd', (req, res, next) =>
	{
		console.log(`Adding '${req.query.url}'...`)
		if(!req.query.url)
			return
		fs.readFile(QueuePath, 'utf8', (err, data) =>
		{
			data = JSON.parse(data)
			data.queue = data.queue || []
			data.queue.push({ url: req.query.url })
			fs.writeFile(QueuePath, JSON.stringify(data), (err) =>
			{
				if(err)
					throw err
				console.log(`Updated queue (added '${req.query.url}')`)
				res.end('success')
			})
		})
	})

	let server = app.listen(8081, () =>
	{
		let host = server.address().address
		let port = server.address().port
		console.log(`Music server API listening at http://${host}:${port}`)
	})
}
