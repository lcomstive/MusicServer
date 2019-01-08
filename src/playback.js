const Timers = require('timers')
const globals = require('./globals')
const JSONReader = require('./jsonreader')

const UpdatesPerSecond = 2

module.exports = class Playback
{
	constructor(downloader)
	{
		this._downloader = downloader
		this.queue = JSONReader(globals.QueuePath)
		this.currentSongIndex = -1

		this.songState =
		{
			paused: false,
			durationTotal: 0,
			durationRemaining: 0
		}

		// Set up queue
		this.queue.songs = this.queue.songs || []
		if(this.queue.songs.length == 0)
			this.queue.save() // write file if (probably) doesn't exist

		let self = this
		this.timeout = Timers.setInterval(() => { self._update() }, 1000 / UpdatesPerSecond)
	}

	next() { this.changeSong(this.currentSongIndex < (this.queue.songs.length - 1) ? (this.currentSongIndex + 1) : 0); this._sendUpdates() }
	prev() { this.changeSong(this.currentSongIndex > 0 ? (this.currentSongIndex - 1) : this.queue.songs.length - 1); this._sendUpdates() }
	togglePause(pause = undefined) { this.songState.paused = (pause == undefined ? !this.songState.paused : pause); this._sendUpdates() }

	// Returns false is song is paused or no songs left in queue
	isPlaying() { return !this.songState.paused && this.currentSongIndex >= 0 }

	seek(seconds)
	{
		if(seconds < 0)
			seconds = 0
		else if(seconds >= this.songState.durationTotal)
			seconds = this.songState.durationTotal - 1
		this.songState.durationRemaining = this.songState.durationTotal - seconds

		this._sendUpdates()
	}

	changeSong(index)
	{
		// Loop around
		if(index > this.queue.length - 1 || index < 0)
			index = 0

		if(this.queue.songs.length == 0)
		{
			this.currentSongIndex = -1
			console.log('Empty queue, not playing anything')
			return
		}

		console.log(`Attempting to get information for playback '${this.queue.songs[index]}'`)
		let song = this._downloader.getInfo(this.queue.songs[index])
		this.songState = {
			paused: false,
			durationTotal: song.duration || 0,
			durationRemaining: song.duration || 0
		}
		this.currentSongIndex = index
		console.log(`Now playing '${song.title}'...`)
		this._sendUpdates()
	}

	// Current song object
	// {
	//		id: YouTube video ID
	//		path: Path to audio file (e.g. 'music/UglrFGiS3f0.mp3')
	//		title: Song title
	//		artist: Song artist
	//		paused: Whether or not playback has been paused
	//		durationTotal: Overall length of song
	//		durationRemaining: Length left of song
	// }
	currentSong()
	{
		if(this.queue.songs.length == 0)
			return undefined
		let song = this._downloader.getInfo(this.queue.songs[this.currentSongIndex])
		return {
			title: song.title,
			artist: song.artist,
			paused: this.songState.paused,
			id: this.queue.songs[this.currentSongIndex],
			durationTotal: Math.floor(this.songState.durationTotal),
			durationRemaining: Math.floor(this.songState.durationRemaining),
			path: `music/${this.queue.songs[this.currentSongIndex]}.mp3`,
		}
	}

	addUpdateCallback(callback)
	{
		if(!this._updateCallbacks)
			this._updateCallbacks = []
		let ID = Math.floor(Math.random() * 100)
		this._updateCallbacks.push({ id: ID, callback: callback })
		return ID
	}

	removeUpdateCallback(ID)
	{
		if(!this._updateCallbacks || !this._updateCallbacks[ID])
			return
		this._updateCallbacks = this._updateCallbacks.filter(x => x.id != ID)
	}

	_update()
	{
		if(this.songState.paused || this.currentSongIndex < 0)
			return
		this.songState.durationRemaining -= (1 / UpdatesPerSecond)

		// debug info
		let song = this._downloader.getInfo(this.queue.songs[this.currentSongIndex])
		// console.log(`Song '${song.title}' has ${this.songState.durationRemaining} seconds left`)

		if(this.songState.durationRemaining <= 0)
		{
			if(globals.settings.removeAfterPlay)
			{
				this.queue.songs.splice(this.currentSongIndex, 1)
				this.queue.save()
			}
			this.next()
		}
	}

	_sendUpdates()
	{
		for(let i = 0; i < this._updateCallbacks.length; i++)
			this._updateCallbacks[i].callback()
	}
}
