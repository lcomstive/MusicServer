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

		if(this.queue.lastPlayed)
			this.currentSongIndex = this.queue.lastPlayed

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

	next() { this.changeSong(this.currentSongIndex + 1); this._sendUpdates() }
	prev() { this.changeSong(this.currentSongIndex - 1); this._sendUpdates() }
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
		if(index > this.queue.songs.length - 1)
			index = 0
		else if(index < 0)
			index = this.queue.songs.length - 1

		if(this.queue.songs.length == 0)
		{
			this.currentSongIndex = -1
			console.log('Empty queue, not playing anything')
			return
		}

		let song = this._downloader.getInfo(this.queue.songs[index])
		if(!song)
		{
			console.log(`Failed to play song at index #${index}`)

			return
		}
		this.songState = {
			paused: false,
			durationTotal: song.duration || 0,
			durationRemaining: song.duration || 0
		}
		this.currentSongIndex = index
		console.log(`Now playing '${song.title}'...`)
		this._sendUpdates()

		this.queue.lastPlayed = index
		this.queue.save()
	}

	// Current song object
	// {
	//		id: YouTube video ID
	//		path: Path to audio file (e.g. 'music/UglrFGiS3f0.mp3')
	//		title: Song title
	//		paused: Whether or not playback has been paused
	//		durationTotal: Overall length of song
	//		durationRemaining: Length left of song
	// }
	currentSong()
	{
		if(this.queue.songs.length == 0 || this.currentSongIndex == undefined || this.currentSongIndex < 0)
			return undefined
		let song = this._downloader.getInfo(this.queue.songs[this.currentSongIndex])
		if(!song || !song.title)
			return
		return {
			title: song.title,
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

	addQueueChangeCallback(callback)
	{
		if(!this._queueChangeCallbacks)
			this._queueChangeCallbacks = []
		let ID = Math.floor(Math.random() * 100)
		this._queueChangeCallbacks.push({ id: ID, callback: callback })
		return ID
	}

	removeUpdateCallback(ID)
	{
		if(!this._updateCallbacks || !this._updateCallbacks[ID])
			return
		this._updateCallbacks = this._updateCallbacks.filter(x => x.id != ID)
	}

	removeUpdateCallback(ID)
	{
		if(!this._queueChangeCallbacks || !this._queueChangeCallbacks[ID])
			return
		this._queueChangeCallbacks = this._queueChangeCallbacks.filter(x => x.id != ID)
	}

	removeSong(index)
	{
		if(index < 0 || index >= this.queue.songs.length)
			return // invalid index
		this.queue.songs.splice(index, 1)
		this.queue.save()
		this._sendUpdates()
	}

	_update()
	{
		if(this.songState.paused || this.currentSongIndex < 0)
			return
		this.songState.durationRemaining -= (1 / UpdatesPerSecond)

		// Should the next song be played?
		if(this.songState.durationRemaining <= 0)
		{
			if(globals.settings.removeAfterPlay)
				this.removeSong(this.currentSongIndex)
			if(globals.settings.shuffle)
				this.changeSong(Math.floor(Math.random() * this.queue.songs.length))
			else
				this.next()
		}
	}

	_sendUpdates()
	{
		for(let i = 0; i < this._updateCallbacks.length; i++)
			this._updateCallbacks[i].callback()
	}

	_sendQueueChangeUpdates()
	{
		for(let i = 0; i < this._queueChangeCallbacks.length; i++)
			this._queueChangeCallbacks[i].callback()
	}
}
