'use strict';

const $fs = require('fs');
const $path = require('path');
const $Promise = require('./promise.js');

require('./prototypes.js');

const $stateInitial = 0x00;
const $stateData = 0x01;
const $stateCache = 0x02;
const $stateLog = 0x04;
const $stateWebServer = 0x08;
const $stateLoaded = 0x0f;

module.exports = (config) =>
{
	let _serverManager = this;
	let _cache = {};
	let _altered = true;
	let _startState = $stateInitial;
	let _mongoose;
	let _root = $path.dirname(require.main.filename).appendTrail('/');
	let _serverManagerStart = new $Promise();

	_serverManager.config = config || {};

	_serverManager.config.server = _serverManager.config.server || {};
	_serverManager.config.server.file = (_serverManager.config.server.file ? _root + _serverManager.config.server.file : null);
	_serverManager.config.server.watchModules = (_serverManager.config.server.watchModules == true) && (_serverManager.config.server.file !== null);

	_serverManager.config.web = _serverManager.config.web || {};
	_serverManager.config.web.root = _root + (_serverManager.config.web.root || './web/').appendTrail('/');
	_serverManager.config.web.defaultFile = _serverManager.config.web.defaultFile || 'index.html';
	_serverManager.config.web.protocol = _serverManager.config.web.protocol || 'http';
	_serverManager.config.web.port = _serverManager.config.web.port || 80;
	_serverManager.config.web.messageSizeLimit = _serverManager.config.web.messageSizeLimit || 1e5;
	_serverManager.config.web.disablePost = (_serverManager.config.web.disablePost == true);
	_serverManager.config.web.webSockets = (_serverManager.config.web.webSockets == true) || _serverManager.config.web.disablePost;

	_serverManager.config.cache = _serverManager.config.cache || {}
	_serverManager.config.cache.format = _serverManager.config.cache.format || 'file';
	_serverManager.config.cache.file = _root + (_serverManager.config.cache.file || './cache.json');
	_serverManager.config.cache.interval = _serverManager.config.cache.interval || 60;

	_serverManager.config.log = _serverManager.config.log || {};
	_serverManager.config.log.format = _serverManager.config.log.format || 'file';
	_serverManager.config.log.path = _root + (_serverManager.config.log.path || './log/').appendTrail('/');

	verifyConfig();

	_serverManager.Promise = $Promise;

	let _app = null;

	if (_serverManager.config.server.file)
	{
		_app = require(_serverManager.config.server.file);

		if (typeof _app.start !== 'function')
		{
			logExit('The application does not export start() method');
		}
	}

	let _starting = new $Promise()
		.then((state) =>
		{
			_startState |= state;

			if (state === $stateCache && _serverManager.config.cache.interval != null)
			{
				setCacheInterval();
			}
			if (state === $stateLog)
			{
				_serverManager.webServer = new require('./webServer.js')(_serverManager);

				_serverManager.webServer.loading
					.then(() =>
					{
						if (_serverManager.config.web.webSockets)
						{
							_serverManager.webSocket = new require('./webSocket.js')(_serverManager);
						}
			
						_starting.resolve($stateWebServer);
					});
			}

			if (_startState === $stateLoaded)
			{
				if (_app)
				{
					_app.start(_serverManager);
				}
				logInfo('App started');
				_serverManagerStart.resolve(_serverManager);
			}
		});

	if (_serverManager.config.log.format === 'mongoose'
		|| _serverManager.config.cache.format === 'mongoose'
		|| _serverManager.config.server.database === 'mongoose'
	)
	{
		_serverManager.mongoose = module.parent.require('mongoose');
		_serverManager.mongoose.connect(_serverManager.config.mongoose)
			.then((data) => {
				_mongoose = {
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
				};

				logInfo('Mongoose connection opened');
		
				if (_serverManager.config.server.database === 'mongoose')
				{
					_starting.resolve($stateData);
				}
				if (_serverManager.config.log.format === 'mongoose')
				{
					_starting.resolve($stateLog);
				}
				if (_serverManager.config.cache.format === 'mongoose')
				{
					initCache();
				}
			}) // then()
			.catch((error) =>
			{
				logExit('Unabled to connect to MongoDB database', error);
			});
	}

	if (_serverManager.config.log.format === 'mysql'
		|| _serverManager.config.cache.format === 'mysql'
		|| _serverManager.config.server.database === 'mysql'
	)
	{
		_serverManager.mysql = require('./mysql.js')(_serverManager.config.mysql);
		_serverManager.mysql.starting
			.then(() =>
			{
				logInfo('MySql connected');

				if (_serverManager.config.server.database === 'mysql')
				{
					_starting.resolve($stateData);
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
							logInfo('MySql log database initialised');
							_starting.resolve($stateLog);
						})
						.catch((error) =>
						{
							logExit('MySql log database structure verification failed', error);
						});
				}
				if (_serverManager.config.cache.format === 'mysql')
				{
					initCache();
				}
			})
			.catch((error) =>
			{
				setTimeout(() =>
				{
					logExit('MySql connection failed', error);
				});
			});
	}
	
	if (_serverManager.config.server.database !== 'mongoose' && _serverManager.config.server.database !== 'mysql')
	{
		_starting.resolve($stateData);
	}

	if (_serverManager.config.log.format === 'file')
	{
		logInfo('Logging into files');
		_starting.resolve($stateLog);
	}
	if (_serverManager.config.log.format === 'stdout')
	{
		logInfo('Logging int stdout');
		_starting.resolve($stateLog);
	}
	if (_serverManager.config.log.format === 'off')
	{
		logInfo('No logging');
		_starting.resolve($stateLog);
	}

	if (_serverManager.config.cache.format === 'file')
	{
		initCache();
	}
	if (_serverManager.config.cache.format === 'off')
	{
		_starting.resolve($stateCache);
		logInfo('No cache backup');
	}

	if (_serverManager.config.server.watchModules)
	{
		let restartTimer = null;
		let modules = [_serverManager.config.server.file];
		let filenames = [];

		if (_app.subModules)
		{
			modules = modules.concat(_root + _app.subModules);
		}

		modules.forEach((item) =>
		{
			filenames.push($path.parse(item).base);

			$fs.watch(item, { persistent: true }, () =>
			{
				if (restartTimer !== null)
				{
					clearTimeout(restartTimer);
				}
				restartTimer = setTimeout(() =>
					{
						_serverManager.restartApp();
						restartTimer = null;
					},
					100
				);
			});
		});

		logInfo('Watching modules: ' + filenames.join(', '));
	}

	_serverManager.initCache = (section, defaultData) =>
	{
		if (!section)
		{
			logExit('Cache section was not defined');
		}

		if (_cache[section] === undefined)
		{
			_cache[section] = {
				altered: false,
				data: defaultData
			};
		}
	};

	_serverManager.cache = (section, data)	=>
	{
		if (!section)
		{
			logExit('Cache section was not defined');
		}

		if (data === undefined)
		{
			return _cache[section].data; 
		}

		if (Array.isArray(data))
		{
			_cache[section].data = data;
			_cache[section].altered = true;
			return;
		}

		for (let key in data)
		{
			if (data[key] == null)
			{
				delete _cache[section].data[key];
			}
			else
			{
				_cache[section].data[key] = data[key];
			}
		}

		_cache[section].altered = true;
	};

	_serverManager.writeLog = (protocol, status, request, startTime, err) =>
	{
		let duration = new Date().getTime() - (startTime || new Date().getTime());

		if (duration > 1000)
		{
			logError('Slow action', protocol + ' (' + (request.action ? request.action + ': ' : '') + status + '): ' + duration + 'ms');
		}

		request = request || {};

		let data = {
			protocol: protocol,
			status: status,
			duration: duration
		};
		if (request.action)
		{
			data['action'] = request.action;
		}
		else if (request.url)
		{
			data['action'] = request.url;
		}
		if (request.method)
		{
			data['method'] = request.method;
		}
		if (request.connection)
		{
			data['remote'] = request.connection.remoteAddress;
		}
		if (err)
		{
			data['error'] = err;
		}

		if (request.inputDataLength)
		{
			data['input'] = request.inputDataLength;
		}
		if (request.outputDataLength)
		{
			data['output'] = request.outputDataLength;
		}

		if (_serverManager.config.log.format === 'mongoose')
		{
			(new _mongoose.Log(data)).save()
				.catch((error) =>
				{
					logError('Failed to write log entry', error)
				});
		}
		else if (_serverManager.config.log.format === 'mysql')
		{
			_serverManager.mysql.insert('log', data);
		}
		else if (_serverManager.config.log.format === 'file')
		{
			let date = new Date();

			$fs.appendFile(
				[_serverManager.config.log.path, date.getFullYear(), '-', padZeros(date.getMonth() + 1), '-', padZeros(date.getDate()), '.log'].join(''),
				JSON.stringify(data) + '\n',
				{ encoding: 'utf8' },
				() => {}
			);
		}
		else if (_serverManager.config.log.format === 'stdout')
		{
			console.log(data);
		}
	};

	_serverManager.restartApp = () =>
	{
		if (_app === null)
		{
			return;
		}

		logInfo('Recycling modules');

		if (_app.subModules)
		{
			_app.subModules.forEach((module) =>
			{
				delete require.cache[require.resolve(module)];
			});
		}

		delete require.cache[require.resolve(_serverManager.config.server.file)];

		_app = require(_serverManager.config.server.file);
		_app.start(_serverManager);

		logInfo('App restarted');
	};

	_serverManager.setListener = (callback) =>
	{
		_serverManager.webServer.setListener(callback);
		if (_serverManager.webSocket)
		{
			_serverManager.webSocket.setListener(callback);
		}
	};

	_serverManager.broadcast = (groupId, dataType, data, lifeSpan) =>
	{
		_serverManager.webServer.broadcast(groupId, dataType, data, lifeSpan);
		if (_serverManager.webSocket)
		{
			_serverManager.webSocket.broadcast(groupId, dataType, data);
		}
	};

	return _serverManagerStart;
	

	function verifyConfig()
	{
		if (_serverManager.config.server.file && !$fs.existsSync(_serverManager.config.server.file))
		{
			logExit('Application file was not found', _serverManager.config.server.file);
		}
	
		if (!$fs.existsSync(_serverManager.config.web.root + _serverManager.config.web.defaultFile))
		{
			logExit('Default file was not found', _serverManager.config.web.root + _serverManager.config.web.defaultFile);
		}

		if (!['http', 'https'].includes(_serverManager.config.web.protocol))
		{
			logExit('Invalid web protocol', _serverManager.config.web.protocol);
		}

		if (_serverManager.config.web.port < 1 || _serverManager.config.web.port > 65535)
		{
			logExit('Invalid web port', _serverManager.config.web.protocol);
		}

		if (typeof _serverManager.config.web.messageSizeLimit !== 'number' || _serverManager.config.web.messageSizeLimit < 1000)
		{
			logExit('Invalid message size limit', _serverManager.config.web.messageSizeLimit);
		}
	
		if (!['off', 'file', 'mysql', 'mongoose'].includes(_serverManager.config.cache.format))
		{
			logExit('Invalid cache format', _serverManager.config.cache.format);
		}

		if (_serverManager.config.cache.format !== 'off' && (_serverManager.config.cache.interval < 1 || _serverManager.config.cache.interval > 36000))
		{
			logExit('Invalid cache interval', _serverManager.config.cache.interval);
		}

		if (_serverManager.config.cache.format === 'file')
		{
			$fs.appendFileAsync(
				_serverManager.config.cache.file,
				'',
				{ encoding: 'utf8' },
				(error) =>
				{
					logExit('Unabled to write into cache file', error);
				}
			);
		}
		
		if (!['off', 'stdout', 'file', 'mysql', 'mongoose'].includes(_serverManager.config.log.format))
		{
			logExit('Invalid log format', _serverManager.config.log.format);
		}
	
		if (_serverManager.config.log.format === 'file' && !$fs.existsSync(_serverManager.config.log.path))
		{
			logExit('Cannot access log path', _serverManager.config.log.path);
		}
	} // verifyConfig()

	function initCache()
	{
		if (_serverManager.config.cache.format === 'mongoose')
		{
			_mongoose.Cache.find({})
				.then((data) =>
				{
					data.forEach((section) =>
					{
						_cache[section.name] = {
							altered: false,
							_id: section._id,
							data: section.data
						};
					});

					logInfo('MongoDB cache loaded');

					_starting.resolve($stateCache);
				})
				.catch((error) =>
				{
					logExit('Failed to initialize MongoDB cache', error);
				});
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
							for (let r = 0; r < data.result.length; r++)
							{
								_cache[data.result[r].section] = {
									altered: false,
									data: JSON.parse(data.result[r].data)
								};
							}

							logInfo('MySql cache loaded');

							_starting.resolve($stateCache);
						})
						.catch((error) =>
						{
							logExit('Unabled to read MySql cache', error);
						});
				})
				.catch((error) =>
				{
					logExit('Failed to initialize MySql cache', error);
				});
		}
		else if (_serverManager.config.cache.format === 'file')
		{
			if ($fs.existsSync(_serverManager.config.cache.file))
			{
				_cache = JSON.parse($fs.readFileSync(_serverManager.config.cache.file, 'utf8'));
				_starting.resolve($stateCache);
				logInfo('File cache loaded');
			}
			else
			{
				_cache = {};
				_starting.resolve($stateCache);
				logInfo('Using file cache');
			}
		}
	} // initCache()

	function setCacheInterval()
	{
		let cacheFunction;

		if (_serverManager.config.cache.format === 'mongoose')
		{
			cacheFunction = saveCacheToMongoDB;
		}
		else if (_serverManager.config.cache.format === 'mysql')
		{
			cacheFunction = saveCacheToMySql;
		}
		else if (_serverManager.config.cache.format === 'file')
		{
			cacheFunction = saveCacheToFile;
		}
		else
		{
			return;
		}

		setInterval(
			cacheFunction,
			_serverManager.config.cache.interval * 1000
		);
	} // setCacheInterval()

	function saveCacheToMongoDB()
	{
		if (_app && _app.saveCache)
		{
			_app.saveCache();
		}
	
		if (_altered)
		{
			for (let section in _cache)
			{
				let entry = new _mongoose.Cache({
					_id: _cache[section]._id,
					name: section,
					data: _cache[section].data
				});
				entry.isNew = !_cache[section]._id;
				entry.save()
					.then((data) =>
					{
						_cache[section]._id = data._id;
					})
					.catch((error) =>
					{
						logError('Failed to save cache into MongoDB', error);
					});
			}
		}
	} // function saveCacheToMongoDB()
	
	function saveCacheToMySql()
	{
		if (_app && _app.saveCache)
		{
			_app.saveCache();
		}

		if (_altered)
		{
			let sql = ['REPLACE LOW_PRIORITY INTO cache VALUES ']
			let list = []

			for (let section in _cache)
			{
				list.push([
					'(\'',
					section,
					'\', ',
					_serverManager.mysql.encode(JSON.stringify(_cache[section].data)),
					')'
				].join(''));
			}

			sql.push(list.join(', '));

			_serverManager.mysql.query(sql.join(''))
				.catch((error) =>
				{
					logError('Failed to save MySql cache', error);
				});

				_altered = false;
		}
	} // function saveCacheToMySql()

	function saveCacheToFile()
	{
		if (_app && _app.saveCache)
		{
			_app.saveCache();
		}

		if (_altered)
		{
			$fs.writeFile(
				_serverManager.config.cache.file,
				JSON.stringify(_cache),
				{ encoding: 'utf8' }
			);
			_altered = false;
		}
	} // function saveCacheToFile()
};

function padZeros(number)
{
	let output = number.toString();

	if (output.length < 2)
	{
		return '0'.repeat(2 - output.length) + output;
	}

	return output.slice(-2);
};

function logInfo(message)
{
	console.log('ServerManager - ' + message);
}

function logError(message, error)
{
	console.error('ServerManager - ' + message);
	if (error)
	{
		console.error('>' + error);
	}
}

function logExit(message, error)
{
	logError(message, error)
	process.exit();
}
