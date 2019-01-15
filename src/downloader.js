const fs = require('fs')
const globals = require('./globals')
const JSONReader = require('./jsonreader')
const MP3Duration = require('mp3-duration')
const FFMPEGBinaries = require('ffmpeg-binaries')
const YoutubeMP3Downloader = require('youtube-mp3-downloader')

songTemplate = (videoID) => { return {
		id: videoID,
		file: undefined,
		title: undefined,
		thumbnail: undefined,
		progress: {
			percentage: 0,
			eta: 999
		}
	}
}

module.exports = class Downloader
{
	constructor()
	{
		this._musicPath = globals.MusicPath + (globals.MusicPath.endsWith('/') ? '' : '/')
		this.outputPath = `${this._musicPath}downloads/`
		if(!fs.existsSync(this._musicPath))
			fs.mkdirSync(this._musicPath)
		if(!fs.existsSync(this.outputPath))
			fs.mkdirSync(this.outputPath)

		this.songs = new Map()
		this._callbacks = {}

		this._ytdl = new YoutubeMP3Downloader({
			queueParallelism: 3,
			outputPath: this.outputPath,
			ffmpegPath: FFMPEGBinaries,
			progressTimeout: 2000,
			youtubeVideoQuality: 'highest'
		})

		this._ytdl.on('progress', (data) =>
		{
			// Update song map
			let song = this.songs.get(data.videoId) || songTemplate(data.videoId)
			song.progress = {
				percentage: Math.ceil(data.progress.percentage),
				eta: data.progress.eta
			}
			this.songs.set(data.videoId, song)

			// Update song in cache
			let cacheIndex = this._cache.songs.findIndex(x => x.id == data.videoId)
			if(cacheIndex < 0) // not found
				this._cache.songs.push(song)
			else
				this._cache.songs[cacheIndex].progress = song.progress
			this._cache.save()

			// Print to console and invoke any existing callback
			console.log(`Progress for '${data.videoId}' - ${Math.ceil(data.progress.percentage)}% - ETA of ${data.progress.eta} seconds - ${Math.floor(data.progress.speed / 8096)}KB/s (runtime ${data.progress.runtime}s)`)
			if(this._callbacks[data.videoId] && this._callbacks[data.videoId].progress)
				this._callbacks[data.videoId].progress(data)
		})

		this._ytdl.on('finished', (err, data) =>
		{
			MP3Duration(`${this.outputPath}${data.videoId}.mp3`, (err, duration) =>
			{
				if(err)
				{
					console.log(`Error getting duration of '${data.videoId}.mp3' - ${err}`)
					return
				}
				duration = Math.ceil(duration)

				// Update song data to include duration
				let song = this.songs.get(data.videoId)
				song.duration = duration
				this.songs.set(data.videoId, song)

				// Update cached data
				let cacheIndex = this._cache.songs.findIndex(x => x.id == data.videoId)
				if(cacheIndex < 0)
					this._cache.songs.push(song)
				else
					this._cache.songs[cacheIndex].duration = duration
				this._cache.save()

				console.log(`${data.videoId} is ${duration} seconds in length`)
				this._songFinished(data)
			})
		})

		this._ytdl.on('error', (error, data) =>
		{
			if(this.songs.has(data.videoId))
			{
				let song = this.songs.get(data.videoId)
				// Set song.file instead of creating a new variable
				song.file = `${this._musicPath}${song.id}.mp3`

				// Delete .mp3 file
				if(fs.existsSync(song.file))
					fs.unlinkSync(song.file)

				// Remove from cached songs
				this._cache.songs = this._cache.songs.filter(x => x.id != data.videoId)
				this._cache.save()
			}

			// Print to console and invoke any existing callback
			console.log(`Error downloading song '${data.videoId}' - ${error}`)

			if(this._callbacks[data.videoId] && this._callbacks[data.videoId].error)
				this._callbacks[data.videoId].error(error, data)
			else
				console.log(`No error callback for video ID '${data.videoId}'`)
		})

		this._cache = JSONReader(`${this._musicPath}cache.json`)
		this._cache.songs = this._cache.songs || []

		for(let i = this._cache.songs.length - 1; i >= 0; i--)
		{
			let song = this._cache.songs[i]

			// Check for unfinished downloads and remove them
			if(song.progress && song.progress < 100)
			{
				// Set song.file instead of creating a new variable
				song.file = `${this._musicPath}${song.id}.mp3`
				// Delete unfinished download if it was started
				if(fs.existsSync(song.file))
					fs.unlinkSync(song.file)
				// Remove from cached songs
				this._cache.songs.splice(i, 1)
				continue
			}
			// Add cached song to song list
			this.songs.set(song.id, song)
		}
		this._cache.save()
	}

	// Downloads the YouTube video with the given ID
	//	videoID 			- ID of YouTube video
	//	callbacks (optional) - Callbacks passed from youtube-mp3-downloader
	//		{
	//			finished: (data),
	//			error: (error, data),
	//			progress: (data)
	//		}
	download(videoID, callbacks = undefined)
	{
		if(!this.isValidVideoID(videoID))
		{
			console.log(`Attempting to download video without valid video ID - '${videoID || 'undefined'}'`)
			return
		}
		this._callbacks[videoID] = callbacks
		if(this.songs.has(videoID)) // song already downloaded
		{
			console.log(`'${videoID}' already downloaded`)

			let finishedSong = this.songs.get(videoID)
			finishedSong.videoId = videoID
			this._songFinished(finishedSong)
			return
		}
		let song = songTemplate(videoID)
		this.songs.set(videoID, song)
		this._cache.songs.push(song)
		this._cache.save()

		console.log(`Started download for '${videoID}'`)
		this._ytdl.download(videoID, `${videoID}.mp3`)
	}

	// Returns 'song' object with 'id' of videoID, equivalent to YouTube video ID
	// song {
	//		id : number   	- YouTube video ID
	//		file : string 	- Path to file
	//		title : string 	- Song title
	//		duration : number - Song length in seconds
	//		progress : {
	//			percentage : number - Download progress from 0-100
	//			eta : number - Estimated time until 100%
	//		}
	// }
	getInfo(videoID)
	{
		if(!this.isValidVideoID(videoID))
		{
			console.log(`Attempting to get information about a download without a valid video ID - '${videoID || 'undefined'}'`)
			return undefined
		}
		if(!this.songs.has(videoID))
		{
			console.log(`Attempted to get song with ID '${videoID}' but doesn't exist in song list`)
			return undefined
		}
		return this.songs.get(videoID)
	}

	songDownloaded(videoID)
	{
		if(!this.isValidVideoID(videoID))
		{
			console.log(`Attempting to check if video is downloaded but has invalid video ID - '${videoID || 'undefined'}'`)
			return false
		}
		return this.songs.has(videoID)
	}

	isValidVideoID(videoID) { return videoID && videoID.length == 11 }

	_songFinished(data)
	{
		// Update song map
		let song = this.songs.get(data.videoId)
		song.file = `music/${data.videoId}.mp3`,
		song.title = (data.videoTitle ? data.videoTitle.replace(/(\[.*\]|\/\/.*)/g, '') : (data.title || 'No Title?')),
		song.thumbnail = data.thumbnail
		song.progress = {
			percentage: 100,
			eta: 0
		}
		song.duration = song.duration || 0
		this.songs.set(data.videoId, song)

		// Update song in cache
		let cacheIndex = this._cache.songs.findIndex(x => x.id == data.videoId)
		if(cacheIndex < 0)
			this._cache.songs.push(song)
		else
			this._cache.songs[cacheIndex] = song
		this._cache.save()

		// Invoke any existing callback
		if(this._callbacks[data.videoId] && this._callbacks[data.videoId].finished)
			this._callbacks[data.videoId].finished(data)
		else
			console.log(`No finished callback for video ID '${data.videoId}'`)
	}
}
