const fs = require('fs')

checkDirectoryExists = (file) =>
{
	let directory = /.*(\/|\\)/g.exec(file)[0]
	// console.log(`Checking directory exists '${directory}'`)
	if(!fs.existsSync(directory))
		fs.mkdirSync(directory)
}

class JSONReader
{
	constructor(path)
	{
		if(!path)
		{
			console.log('Invalid path in constructor of JSONReader!')
			return
		}
		this._path = path
		this.data = {}

		checkDirectoryExists(path)
		this.refresh()
	}

	// re-reads the file into 'this.data'
	refresh() { this.data = this.read() }

	// Returns file without overriding 'this.data'
	read()
	{
		if(!fs.existsSync(this._path))
			fs.writeFileSync(this._path, '{}') // write a default .json file
		// Read file
		return JSON.parse(fs.readFileSync(this._path))
	}

	save() // Write config
	{
		fs.writeFileSync(this._path, JSON.stringify(this.data, undefined, '\t')) // use tabs for whitespace
	}
}

// Proxy so commands can call e.g. 'this.config.id' instead of 'this.config.data.id' (just code reduction and easier reading)
module.exports = (path) => new Proxy(new JSONReader(path), {
	get: (target, name) =>
	{
		if(name in target)
			return target[name]
		if(name in target.data)
			return target.data[name]
		return undefined
	},

	set: (target, name, value) =>
	{
		if(name in target)
			target[name] = value
		else if(name in target.data)
			target.data[name] = value
		else
			target.data[`${name}`] = value
		return true
	}
})
