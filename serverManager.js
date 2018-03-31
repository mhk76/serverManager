'use strict'

const $fs = require('fs')
const $path = require('path')
const $Promise = require('./promise.js')

require('./prototypes.js')

const $root = $path.dirname(require.main.filename).appendTrail('/')

const $stateUnloaded = 0x00
const $stateData = 0x01
const $stateCache = 0x02
const $stateLog = 0x04
const $stateWebServer = 0x08
const $stateLoaded = 0x0f

module.exports = (config) =>
{
	let _serverManager = this
	let _cache = {
		altered: false,
		sections: {}
	}
	let _startState = $stateUnloaded
	let _mongooseModels
	let _serverManagerStart = new $Promise()
	let _app

	_serverManager.config = verifyConfig(config)

	_serverManager.Promise = $Promise

	if (_serverManager.config.server.file)
	{
		_app = require(_serverManager.config.server.file)

		if (typeof _app.start !== 'function')
		{
			logExit('The application does not export start() method')
		}
	}

	let _initializing = new $Promise()
		.then((state) =>
		{
			_startState |= state

			if (state === $stateCache && _serverManager.config.cache.interval != null)
			{
				setCacheInterval()
			}
			if (state === $stateLog)
			{
				_serverManager.webServer = new require('./webServer.js')(_serverManager)

				_serverManager.webServer.loading
					.then(() =>
					{
						if (_serverManager.config.web.webSockets)
						{
							_serverManager.webSocket = new require('./webSocket.js')(_serverManager)
						}
			
						_initializing.resolve($stateWebServer)
					})
			}

			if (_startState === $stateLoaded)
			{
				if (_app)
				{
					setTimeout(() => {
						try
						{
							_app.start(_serverManager)
						}
						catch (error)
						{
							logExit('Error while starting the application', error)
						}
					})
				}
				setTimeout(() =>
				{
					logInfo('The application has started')
					_serverManagerStart.resolve(_serverManager)
				})
			}
		})

	if (_serverManager.config.log.format === 'mongoose'
		|| _serverManager.config.cache.format === 'mongoose'
		|| _serverManager.config.server.database === 'mongoose'
	)
	{
		_serverManager.mongoose = module.parent.require('mongoose')
		_serverManager.mongoose.connect(_serverManager.config.mongoose)
			.then((data) => {
				_mongooseModels = {
					Log: _serverManager.mongoose.model(
							'log',
							{
								protocol  : String,
								status    : String,
								duration  : Number,
								action    : String,
								method    : String,
								ip        : String,
								input     : Number,
								output    : Number,
								error     : String 
							},
							'log'
						),
					Cache: _serverManager.mongoose.model(
							'cache',
							{
								name   : String,
								data   : Object
							},
							'cache'
						)
				}

				logInfo('Mongoose connection opened')
		
				if (_serverManager.config.server.database === 'mongoose')
				{
					_initializing.resolve($stateData)
				}
				if (_serverManager.config.log.format === 'mongoose')
				{
					_initializing.resolve($stateLog)
				}
				if (_serverManager.config.cache.format === 'mongoose')
				{
					initCache()
				}
			}) // then()
			.catch((error) =>
			{
				logExit('Unabled to connect to MongoDB database', error)
			})
	}

	if (_serverManager.config.log.format === 'mysql'
		|| _serverManager.config.cache.format === 'mysql'
		|| _serverManager.config.server.database === 'mysql'
	)
	{
		_serverManager.mysql = require('./mysql.js')(_serverManager.config.mysql)
		_serverManager.mysql.starting
			.then(() =>
			{
				logInfo('MySql connected')

				if (_serverManager.config.server.database === 'mysql')
				{
					_initializing.resolve($stateData)
				}				
				if (_serverManager.config.log.format === 'mysql')
				{
					_serverManager.mysql.verifyTable(
							'log',
							{
								'log_id'    : 'BIGINT NOT NULL AUTO_INCREMENT',
								'timestamp' : 'TIMESTAMP',
								'protocol'  : 'VARCHAR(20) NULL',
								'status'    : 'VARCHAR(50) NULL',
								'duration'  : 'INT NULL',
								'action'    : 'VARCHAR(255) NULL',
								'method'    : 'VARCHAR(50) NULL',
								'ip'        : 'VARCHAR(40) NULL',
								'input'     : 'INT NULL',
								'output'    : 'INT NULL',
								'error'     : 'MEDIUMTEXT NULL'
							},
							['log_id']
						)
						.then(() =>
						{
							logInfo('MySql log database initialised')
							_initializing.resolve($stateLog)
						})
						.catch((error) =>
						{
							logExit('MySql log database structure verification failed', error)
						})
				}
				if (_serverManager.config.cache.format === 'mysql')
				{
					initCache()
				}
			})
			.catch((error) =>
			{
				setTimeout(() =>
				{
					logExit('MySql connection failed', error)
				})
			})
	}
	
	if (_serverManager.config.server.database !== 'mongoose' && _serverManager.config.server.database !== 'mysql')
	{
		_initializing.resolve($stateData)
	}

	if (_serverManager.config.log.format === 'file')
	{
		logInfo('Logging into files')
		_initializing.resolve($stateLog)
	}
	if (_serverManager.config.log.format === 'stdout')
	{
		logInfo('Logging int stdout')
		_initializing.resolve($stateLog)
	}
	if (_serverManager.config.log.format === 'off')
	{
		logInfo('No logging')
		_initializing.resolve($stateLog)
	}

	if (_serverManager.config.cache.format === 'file')
	{
		initCache()
	}
	if (_serverManager.config.cache.format === 'off')
	{
		_initializing.resolve($stateCache)
		logInfo('No cache backup')
	}

	if (_serverManager.config.server.watchModules)
	{
		let restartTimer = null
		let modules = [_serverManager.config.server.file]
		let filenames = []

		if (_app.subModules)
		{
			modules = modules.concat($root + _app.subModules)
		}

		modules.forEach((item) =>
		{
			filenames.push($path.parse(item).base)

			$fs.watch(item, { persistent: true }, () =>
			{
				if (restartTimer !== null)
				{
					clearTimeout(restartTimer)
				}
				restartTimer = setTimeout(() =>
					{
						_serverManager.restartApp()
						restartTimer = null
					},
					_serverManager.config.server.watchDelay
				)
			})
		})

		logInfo('Watching modules: ' + filenames.join(', '))
	}

	_serverManager.initCache = (section, defaultData) =>
	{
		if (!section)
		{
			logExit('Cache section was not defined')
		}

		if (_cache.sections[section] === undefined)
		{
			_cache.sections[section] = {
				altered: false,
				data: defaultData
			}
		}
	}

	_serverManager.cache = (section, data, deleteNull = false)	=>
	{
		if (!section)
		{
			logExit('Cache section was not defined')
		}

		if (data === undefined)
		{
			return _cache.sections[section] && _cache.sections[section].data 
		}

		if (!_cache.sections[section] || Array.isArray(data) || ['string', 'number'].includes(typeof data) || data instanceof Date)
		{
			_cache.sections[section] = {
				altered: true,
				data: data
			}
			_cache.altered = true
			return
		}

		for (let key in data)
		{
			if (deleteNull && data[key] == null)
			{
				delete _cache.sections[section].data[key]
			}
			else
			{
				_cache.sections[section].data[key] = data[key]
			}
		}

		_cache.sections[section].altered = true
		_cache.altered = true
	}

	_serverManager.writeLog = (protocol, status, request, startTime, err) =>
	{
		let duration = new Date().getTime() - (startTime || new Date().getTime())

		if (duration > 1000)
		{
			logError('Slow action', protocol + ' (' + (request.action ? request.action + ': ' : '') + status + '): ' + duration + 'ms')
		}

		request = request || {}

		let data = {
			protocol: protocol,
			status: status,
			duration: duration
		}
		if (request.action)
		{
			data['action'] = request.action
		}
		else if (request.url)
		{
			data['action'] = request.url
		}
		if (request.method)
		{
			data['method'] = request.method
		}
		if (request.connection)
		{
			data['remote'] = request.connection.remoteAddress
		}
		if (err)
		{
			data['error'] = err
		}

		if (request.inputDataLength)
		{
			data['input'] = request.inputDataLength
		}
		if (request.outputDataLength)
		{
			data['output'] = request.outputDataLength
		}

		if (_serverManager.config.log.format === 'mongoose')
		{
			(new _mongooseModels.Log(data)).save()
				.catch((error) =>
				{
					logError('Failed to write log entry', error)
				})
		}
		else if (_serverManager.config.log.format === 'mysql')
		{
			_serverManager.mysql.insert('log', data)
		}
		else if (_serverManager.config.log.format === 'file')
		{
			let date = new Date()

			$fs.appendFile(
				[_serverManager.config.log.path, date.getFullYear(), '-', padZeros(date.getMonth() + 1), '-', padZeros(date.getDate()), '.log'].join(''),
				JSON.stringify(data) + '\n',
				{ encoding: 'utf8' },
				() => {}
			)
		}
		else if (_serverManager.config.log.format === 'stdout')
		{
			console.log(data)
		}
	}

	_serverManager.restartApp = () =>
	{
		if (_app === null)
		{
			return
		}

		logInfo('Recycling modules')

		if (_app.subModules)
		{
			_app.subModules.forEach((module) =>
			{
				delete require.cache[require.resolve(module)]
			})
		}

		delete require.cache[require.resolve(_serverManager.config.server.file)]

		_app = require(_serverManager.config.server.file)
		_app.start(_serverManager)

		logInfo('App restarted')
	}

	_serverManager.setListener = (callback) =>
	{
		if (!_serverManager.config.web.disablePost)
		{
			_serverManager.webServer.setListener(callback)
		}
		if (_serverManager.webSocket)
		{
			_serverManager.webSocket.setListener(callback)
		}
	}

	_serverManager.addUserGroup = (userId, groupId) =>
	{
		if (!_serverManager.config.web.disablePost)
		{
			_serverManager.webServer.addUserGroup(userId, groupId)
		}
		if (_serverManager.webSocket)
		{
			_serverManager.webSocket.addUserGroup(userId, groupId)
		}
	}

	_serverManager.broadcast = (groupId, dataType, data, lifeSpan) =>
	{
		if (!_serverManager.config.web.disablePost)
		{
			_serverManager.webServer.broadcast(groupId, dataType, data, lifeSpan)
		}
		if (_serverManager.webSocket)
		{
			_serverManager.webSocket.broadcast(groupId, dataType, data)
		}
	}

	return _serverManagerStart
	

	function verifyConfig(config)
	{
		config = config || {}

		// server
		config.server = config.server || {}
		config.server.file = (config.server.file ? $root + config.server.file : null)
		config.server.watchModules =
			(config.server.file !== null)
			&& (
				(config.server.watchModules == true)
				|| (process.argv.some((arg) => arg === '-watch' ))
			)
		config.server.watchDelay = parseInt(config.server.watchDelay || 250)
	
		if (config.server.file && !$fs.existsSync(config.server.file))
		{
			logExit('Application file was not found', config.server.file)
		}

		if (config.server.watchDelay < 0 || config.server.watchDelay > 1000)
		{
			logExit('Invalid watch delay (0-1000 [milliseconds])', config.web.protocol)
		}
		
		
		// web
		config.web = config.web || {}
		config.web.root = $root + (config.web.root || './web/').appendTrail('/')
		config.web.defaultFile = config.web.defaultFile || 'index.html'
		config.web.protocol = config.web.protocol || 'http'
		config.web.port = process.env.PORT || config.web.port || 80
		config.web.messageSizeLimit = config.web.messageSizeLimit || 1e5
		config.web.disablePost = (config.web.disablePost == true)
		config.web.webSockets = (config.web.webSockets == true) || config.web.disablePost
	
		if (!$fs.existsSync(config.web.root + config.web.defaultFile))
		{
			logExit('Default file was not found', config.web.root + config.web.defaultFile)
		}

		if (!['http', 'https'].includes(config.web.protocol))
		{
			logExit('Invalid web protocol (http, https)', config.web.protocol)
		}

		if (config.web.port < 1 || config.web.port > 65535)
		{
			logExit('Invalid web port (1-65535)', config.web.protocol)
		}

		if (typeof config.web.messageSizeLimit !== 'number' || config.web.messageSizeLimit < 1000)
		{
			logExit('Invalid message size limit (>1000 [bytes])', config.web.messageSizeLimit)
		}


		// cache
		config.cache = config.cache || {}
		config.cache.format = config.cache.format || 'file'
		config.cache.file = $root + (config.cache.file || './cache.json')
		config.cache.interval = config.cache.interval || 60
	
		if (!['off', 'file', 'mysql', 'mongoose'].includes(config.cache.format))
		{
			logExit('Invalid cache format (off, file, mysql, mongoose)', config.cache.format)
		}

		if (config.cache.format !== 'off' && (config.cache.interval < 1 || config.cache.interval > 3600))
		{
			logExit('Invalid cache interval (1-3600 [seconds])', config.cache.interval)
		}

		if (config.cache.format === 'file')
		{
			$fs.appendFileAsync(
				config.cache.file,
				'',
				{ encoding: 'utf8' },
				(error) =>
				{
					logExit('Unabled to write into cache file', error)
				}
			)
		}

		
		// log
		config.log = config.log || {}
		config.log.format = config.log.format || 'file'
		config.log.path = $root + (config.log.path || './log/').appendTrail('/')
	
		if (!['off', 'stdout', 'file', 'mysql', 'mongoose'].includes(config.log.format))
		{
			logExit('Invalid log format (off, stdout, file, mysql, mongoose)', config.log.format)
		}
	
		if (config.log.format === 'file' && !$fs.existsSync(config.log.path))
		{
			logExit('Cannot access log path', config.log.path)
		}


		return config
	} // verifyConfig()

	function initCache()
	{
		if (_serverManager.config.cache.format === 'mongoose')
		{
			_mongooseModels.Cache.find({})
				.then((data) =>
				{
					data.forEach((section) =>
					{
						_cache.sections[section.name] = {
							altered: false,
							_id: section._id,
							data: section.data
						}
					})

					logInfo('MongoDB cache loaded')

					_initializing.resolve($stateCache)
				})
				.catch((error) =>
				{
					logExit('Failed to initialize MongoDB cache', error)
				})
		}
		else if (_serverManager.config.cache.format === 'mysql')
		{
			_serverManager.mysql.verifyTable(
					'cache',
					{
						'section': 'VARCHAR(255) NOT NULL',
						'data': 'MEDIUMTEXT'
					},
					['section']
				)
				.then(() =>
				{
					_serverManager.mysql.query(
							'SELECT section, data FROM cache'
						)
						.then((data) =>
						{
							data.result.forEach((result) => 
							{
								_cache.sections[result.section] = {
									altered: false,
									data: JSON.parse(result.data)
								}
							})

							logInfo('MySql cache loaded')

							_initializing.resolve($stateCache)
						})
						.catch((error) =>
						{
							logExit('Unabled to read MySql cache', error)
						})
				})
				.catch((error) =>
				{
					logExit('Failed to initialize MySql cache', error)
				})
		}
		else if (_serverManager.config.cache.format === 'file')
		{
			if ($fs.existsSync(_serverManager.config.cache.file))
			{
				_cache = {
					altered: false,
					sections: {}
				}

				let data = JSON.parse($fs.readFileSync(_serverManager.config.cache.file, 'utf8'))

				for (let section in data)
				{
					_cache.sections[section] = {
						altered: false,
						data: data[section]
					}
				}

				_cache.altered = false

				_initializing.resolve($stateCache)
				logInfo('File cache loaded')
			}
			else
			{
				_cache = {
					altered: false,
					sections: {}
				}
				_initializing.resolve($stateCache)
				logInfo('Using file cache')
			}
		}
	} // initCache()

	function setCacheInterval()
	{
		let cacheFunction

		if (_serverManager.config.cache.format === 'mongoose')
		{
			cacheFunction = saveCacheToMongoDB
		}
		else if (_serverManager.config.cache.format === 'mysql')
		{
			cacheFunction = saveCacheToMySql
		}
		else if (_serverManager.config.cache.format === 'file')
		{
			cacheFunction = saveCacheToFile
		}
		else
		{
			return
		}

		setInterval(
			cacheFunction,
			_serverManager.config.cache.interval * 1000
		)
	} // setCacheInterval()

	function saveCacheToMongoDB()
	{
		if (_app && _app.saveCache)
		{
			_app.saveCache()
		}
	
		if (_cache.altered)
		{
			for (let section in _cache.sections)
			{
				let entry = new _mongooseModels.Cache({
					_id: _cache.sections[section]._id,
					name: section,
					data: _cache.sections[section].data
				})
				_cache.sections[section].altered = false
				entry.isNew = !_cache.sections[section]._id
				entry.save()
					.then((data) =>
					{
						_cache.sections[section]._id = data._id
					})
					.catch((error) =>
					{
						logError('Failed to save cache section "' + section + '" into MongoDB', error)
					})
			}

			_cache.altered = false

			for (let section in _cache.sections)
			{
				_cache.altered = _cache.altered || _cache.sections[section].altered
			}
}
	} // function saveCacheToMongoDB()
	
	function saveCacheToMySql()
	{
		if (_app && _app.saveCache)
		{
			_app.saveCache()
		}

		if (_cache.altered)
		{
			let sql = ['REPLACE LOW_PRIORITY INTO cache VALUES ']
			let list = []

			for (let section in _cache.sections)
			{
				list.push([
					'(\'',
					section,
					'\', ',
					_serverManager.mysql.encode(JSON.stringify(_cache.sections[section].data)),
					')'
				].join(''))

				_cache.sections[section].altered = false
			}

			sql.push(list.join(', '))

			_serverManager.mysql.query(sql.join(''))
				.then(() =>
				{
					_cache.altered = false

					for (let section in _cache.sections)
					{
						_cache.altered = _cache.altered || _cache.sections[section].altered
					}
				})
				.catch((error) =>
				{
					logError('Failed to save MySql cache', error)
				})
		}
	} // function saveCacheToMySql()

	function saveCacheToFile()
	{
		if (_app && _app.saveCache)
		{
			_app.saveCache()
		}

		if (_cache.altered)
		{
			let data = []

			for (let section in _cache.sections)
			{
				data[section] = _cache.sections[section].data
			}

			$fs.writeFile(
				_serverManager.config.cache.file,
				JSON.stringify(data),
				{ encoding: 'utf8' }
			)

			_cache.altered = false

			for (let section in _cache.sections)
			{
				_cache.altered = _cache.altered || _cache.sections[section].altered
			}
}
	} // function saveCacheToFile()
}

function padZeros(number)
{
	let output = number.toString()

	if (output.length < 2)
	{
		return '0'.repeat(2 - output.length) + output
	}

	return output.slice(-2)
}

function logInfo(message)
{
	console.log('ServerManager - ' + message)
}

function logError(message, error)
{
	if (error instanceof Error)
	{
		console.error(
			'ServerManager - ' + message + ':\n'
			+ '> ' + error.message + '\n'
			+ '> ' + error.stack.split('at ')[1]
		)
	}
	else if (error)
	{
		console.error(
			'ServerManager - ' + message + ':\n'
			+ '> ' + error
		)
	}
	else
	{
		console.error('ServerManager - ' + message)
	}
}

function logExit(message, error)
{
	logError(message, error)
	process.exit()
}
