const BaseURL = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
let websocket = undefined,
	elements = {},
	currentSong = {},
	settings = {
		volume: 1
	}

const DefaultTheme = {
	titleMaxLength: 55,
	bluriness: '2.5px',
	borderRadius: '3px',
	foreground: '#e5e7ea',
	accentColour: '#42f459',
	buttonBorderRadius: '50px',
	background: 'url(\'https://i.imgur.com/0IWb7dn.gif\')'
}
let currentTheme = undefined

/** THEMES **/
const Themes = {
	forest: {
		foreground: '#e5e7ea',
		accentColour: '#42f459',
		background: `url('https://i.imgur.com/0IWb7dn.gif')`
	},
	desert: {
		accentColour: '#f73827',
		background: `url('https://pro2-bar-s3-cdn-cf2.myportfolio.com/cc8ae36e142f31ec500c842b23649cb8/d272a2ad60efb237f15c3da7c7f485a7ad7374f882a00b7148ff7859deec36b85e7a99aea31ca6af_rw_1920.gif?h=006c7531c2ea55af6ec346b0ecbeda85')`
	}
}

/** UTILS **/
setCookie = (name, value) => { document.cookie = `${name}=${value || ""}; path=/` }

// Modified from https://stackoverflow.com/a/24103596
getCookie = (name, defaultValue = undefined) =>
{
    let nameEQ = `${name}=`,
	 	ca = document.cookie.split(';')
    for(let i = 0; i < ca.length; i++)
	{
        let c = ca[i]
        while (c.charAt(0)==' ')
			c = c.substring(1, c.length)
        if (c.indexOf(nameEQ) == 0)
			return c.substring(nameEQ.length, c.length)
    }
    return defaultValue
}

// Modified from https://stackoverflow.com/a/901144
getParameterByName = (name, url) =>
{
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
        results = regex.exec(url);
    if (!results) return undefined;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

getTimeString = (seconds) =>
{
	let minutesLeft = Math.floor(seconds / 60)
	let secondsLeft = Math.floor(seconds % 60)
	return `${minutesLeft}:${secondsLeft < 10 ? ('0' + secondsLeft) : secondsLeft}`
}

getThemeProperty = (name) => (currentTheme || DefaultTheme)[name] || DefaultTheme[name]
setThemeProperty = (name, value) => document.body.style.setProperty(name, value)

POST = (url, data = {}, callback = undefined) =>
{
	$.ajax({
		type: 'POST',
		url: url,
		data: data,
		dataType: 'json',
		success: (data, textStatus, xhr) =>
		{
			if(callback)
				callback(data)
		}
	})
}

readSettings = () =>
{
	// Theme overrides
	settings.backgroundImage = getParameterByName('backgroundImage')
	settings.accentColour = getParameterByName('accentColour') || getParameterByName('accentColor')

	settings.theme = getParameterByName('theme') || getCookie('theme')
	settings.volume = getParameterByName('volume') || getCookie('volume', 1)
	console.log(`Settings:\n\t${JSON.stringify(settings)}`)
}

/** CONTROLS **/
togglePause = (pause = undefined, local = false) =>
{
	if(local) // control updates
	{
		if(pause == undefined)
			pause = !currentSong.paused

		if(pause)
		{
			elements.audio.pause()
			clearInterval(elements.interval)
		}
		else
		{
			if(elements.audio.readyState >= 3)
				elements.audio.play()
			resetInterval()
		}
	}
	else
		websocket.send(JSON.stringify({
			type: 'pause',
			value: pause
		}))
}

next = () => POST(`${BaseURL}/api/Songs/Next`)
prev = () => POST(`${BaseURL}/api/Songs/Prev`)
changeSong = (index) => POST(`${BaseURL}/api/Songs/Change?index=${isNaN(index) ? 0 : index}`)
seek = (seconds) => POST(`${BaseURL}/api/Songs/Seek?length=${isNaN(seconds) ? 0 : seconds}`)

changeSong = (song) =>
{
	currentSong = song

	// Update audio
	console.log(`Changing to song \n\t${JSON.stringify(song)}`)
	elements.audio.src = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/${song.path}`
	elements.audio.currentTime = song.durationTotal - song.durationRemaining

	// Update title
	let title = `${song.artist && song.artist != 'Unknown' ? (song.artist + ' - ') : ''}${song.title}`
	if(title.length >= currentTheme.titleMaxLength)
		title = title.substring(0, currentTheme.titleMaxLength) + '...'
	elements.controls.songTitle.html(title)

	// Update duration remaining text
	elements.controls.songDuration.html(getTimeString(song.durationRemaining))

	// Update slider
	let slider = $('#seekSlider')
	slider.css('background-image', `${getThemeProperty('foreground')}`)
	slider.attr('max', song.durationTotal)
	elements.controls.slider.value = 0

	// Set interval and audio paused correctly
	togglePause(song.paused, true)
}

/** CALLBACKS **/
gotBulkData = (data) =>
{
	console.log('Bulk Data')

	// changeSong(data.currentSong)
	gotUpdate(data.currentSong)

	/*
	for(let i = 0; i < data.queue.length; i++)
	{
		let text = `[${i}] `
		if(data.queue[i].artist)
			text += `${data.queue[i].artist} - `
		text += data.queue[i].title
		$('#queueList').append(`<p>${text}</p>`)
	}
	*/
}

gotUpdate = (data) =>
{
	console.log(`Update: ${data.title} at ${data.durationRemaining} (Playing? ${!data.paused})`)
	let title = `${data.artist && data.artist != 'Unknown' ? (data.artist + ' - ') : ''}${data.title}`
	if(title.length >= currentTheme.titleMaxLength)
		title = title.substring(0, currentTheme.titleMaxLength) + '...'
	elements.audio.currentTime = data.durationTotal - data.durationRemaining

	elements.controls.songTitle.html(title)
	elements.controls.songDuration.html(getTimeString(data.durationRemaining))
	elements.controls.slider.value = data.durationTotal - data.durationRemaining

	let slider = $('#seekSlider')
	let value = (data.durationTotal - data.durationRemaining) / data.durationTotal
	slider.css('background-image',
	 				`-webkit-gradient(linear, left top, right top, ` +
					`color-stop(${value}, ${getThemeProperty('accentColour')}), ` +
					`color-stop(${value}, ${getThemeProperty('foreground')}))`
				)

	if(data.id != currentSong.id)
		changeSong(data)
	else if(data.paused != currentSong.paused)
		togglePause(data.paused, true)
	currentSong = data
}

/** MISC. **/
setTheme = (theme) =>
{
	currentTheme = theme || DefaultTheme
	setThemeProperty('--foreground', currentTheme.foreground || DefaultTheme.foreground)
	setThemeProperty('--background', currentTheme.background || DefaultTheme.background)
	setThemeProperty('--font-size', currentTheme.fontSize || DefaultTheme.fontSize)
	setThemeProperty('--bluriness', currentTheme.bluriness || DefaultTheme.bluriness)
	setThemeProperty('--border-radius', currentTheme.borderRadius || DefaultTheme.borderRadius)
	setThemeProperty('--accent-colour', currentTheme.accentColour || DefaultTheme.accentColour)
	setThemeProperty('--buttonBorderRadius', currentTheme.buttonBorderRadius || DefaultTheme.buttonBorderRadius)
}

resetInterval = () =>
{
	if(elements.interval)
		clearInterval(elements.interval)
	elements.interval = setInterval(_intervalLoop, 1000)
}
_intervalLoop = () =>
{
	if(currentSong.durationRemaining <= 0)
		return
	// Decrease durationRemaining by 1 and update text
	currentSong.durationRemaining--
	elements.controls.songDuration.html(getTimeString(currentSong.durationRemaining))

	// Update slider
	elements.controls.slider.value = currentSong.durationTotal - currentSong.durationRemaining

	let slider = $('#seekSlider')
	let value = (currentSong.durationTotal - currentSong.durationRemaining) / currentSong.durationTotal
	slider.css('background-image',
	 				`-webkit-gradient(linear, left top, right top, ` +
					`color-stop(${value}, ${getThemeProperty('accentColour')}), ` +
					`color-stop(${value}, ${getThemeProperty('foreground')}))`
				)
}

$(document).ready(() =>
{
	readSettings()

	// Set theme
	let theme = Themes[settings.theme] || DefaultTheme
	if(settings.backgroundImage)
		theme.background = `url(${settings.backgroundImage})`
	if(settings.accentColour)
		theme.accentColour = `#${settings.accentColour}`
	setTheme(theme)

	elements.controls = {
		songTitle: $('#songTitle'),
		songDuration: $('#songDuration'),
		slider: document.getElementById('seekSlider'),
		buttons: {
			prev:  $('#btnPrev'),
			pause: $('#btnPause'),
			next:  $('#btnNext')
		}
	}

	// Create and set up audio DOM
	elements.audio = document.createElement('audio')
	elements.audio.autoplay = true
	elements.audio.volume = settings.volume

	resetInterval()

	websocket = new SimpleWebsocket(`ws://${window.location.hostname}:8082`)
	websocket.on('connect', () => { console.log('Websocket connected') })
	websocket.on('close', () => { console.log('Websocket disconnected') })
	websocket.on('data', (data) =>
	{
		data = JSON.parse(data)
		if(!data.type)
			return
		// console.log(`Got data: ${JSON.stringify(data)}`)
		switch(data.type)
		{
			default: console.log(`Got data: ${JSON.stringify(data)}`); break;
			case 'bulk': gotBulkData(data.info); break;
			case 'update': gotUpdate(data.info); break;
		}
	})
})

$(window).on('beforeunload', () => { websocket.destroy() })
