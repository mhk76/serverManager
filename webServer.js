'use strict'

const $http = require('http')
const $https = require('https')
const $fs = require('fs')
const $path = require('path')
const $mime = require('./mime.json')
const $files = new Map([
	['/serverManagerTools.es6.js', 'serverManagerTools.es6.min.js'],
	['/serverManagerTools.jquery.js', 'serverManagerTools.jquery.min.js'],
	['/serverManagerTools.angular.js', 'serverManagerTools.angular.min.js']
])

module.exports = (serverManager) =>
{
	let _server
	let _port
	let _userGroups = new Map()
	let _broadcasts = []
	let _root = $path.dirname(module.filename).appendTrail('/')
	let _listener = (request) =>
		{
			console.log('WebServer - Default POST listener')
			console.log(request)
			request.response({}, 'ok')
		}

	if (serverManager.config.web.protocol === 'https')
	{
		_server = $https.createServer(
			{
				key: $fs.readFileSync(root + serverManager.config.web.httpsKeyFile),
				cert: $fs.readFileSync(root + serverManager.config.web.httpsCertFile)
			},
			HttpListener
		)
		_port = process.env.PORT || serverManager.config.web.port || 443
	}
	else
	{
		_server = $http.createServer(HttpListener)
		_port = process.env.PORT || serverManager.config.web.port || 80
	}

	_server.loading = new serverManager.Promise()

	_server.listen(
		_port,
		() =>
		{
			serverManager.writeLog(serverManager.config.web.protocol, 'starting')
			console.log('WebServer - listening to port ' + _port)
			_server.loading.resolve()
		}
	)

	_server.setListener = (callback) =>
	{
		_listener = callback
	}

	_server.addUserGroup = (sessionId, groupId) =>
	{
		if (_userGroups.has(sessionId))
		{
			_userGroups.get(sessionId).push(groupId)
		}
		else
		{
			_userGroups.set(sessionId, [groupId])
		}
	}

	_server.broadcast = (groupId, dataType, data, lifeSpan) =>
	{
		_broadcasts.push({
			sessionIds: groupId && Array.from(_userGroups.keys()).filter((sessionId) =>
				{
					return _userGroups.get(item[0]).includes(groupId)
				}),
			requestId: dataType,
			data: {
				status: 'ok',
				data: data
			},
			time: new Date().getTime() + ((lifeSpan || 60) * 1000)
		})
	}

	return _server

	function HttpListener(request, response, head)
	{
		let startTime = new Date().getTime()

		try
		{
			if (request.method === 'GET')
			{
				try
				{
					let getPromise = serverManager.processGET(request)

					if (getPromise)
					{
						getPromise.then((data) =>
						{
							response.write(data)
							response.writeHead(200)
							response.end()
							serverManager.writeLog(serverManager.config.web.protocol, 200, request, startTime)
						})
						.catch((error) =>
						{
							response.writeHead(404)
							response.end()
							serverManager.writeLog(serverManager.config.web.protocol, 404, request, startTime, error)
						})
						return
					}

					let url = $path.parse(request.url)
					let file = $files.get(request.url)

					if (file)
					{
						file = _root + file
					}
					else
					{
						file = serverManager.config.web.root
							+ url.dir.appendTrail('/')
							+ (url.base || serverManager.config.web.defaultFile)
					}

					$fs.access(file, $fs.R_OK, (err) =>
					{
						if (err)
						{
							response.writeHead(404)
							response.end()
							serverManager.writeLog(serverManager.config.web.protocol, 404, request, startTime, err)
							return
						}

						response.writeHead(
							200,
							{ 'Content-type': $mime[url.ext || '.html'] || 'application/octet-stream' }
						)

						$fs.createReadStream(file).pipe(response)

						serverManager.writeLog(serverManager.config.web.protocol, 200, request, startTime)
					})
				}
				catch (err)
				{
					response.writeHead(404)
					response.end()
					serverManager.writeLog(serverManager.config.web.protocol, 404, request, startTime, err)
				}
				return
			}
			
			if (request.method === 'POST' && !serverManager.config.web.disablePost)
			{
				let queryData = []

				request.on('data', (data) =>
				{
					queryData.push(data)
					if (queryData.length > serverManager.config.web.messageSizeLimit)
					{
						queryData = ""

						response.writeHead(413)
						response.end()
						request.connection.destroy()

						serverManager.writeLog(serverManager.config.web.protocol, 413, request, startTime, err)
					}
				})

				request.on('end', () =>
				{
					let inputData = queryData.join('')
					let json
					let buffer = {}

					try
					{
						json = JSON.parse(inputData)						
					}
					catch (exception)
					{
						let appRequest = {
							inputDataLength: inputData.length,
							connection:
							{
								remoteAddress: request.connection.remoteAddress
							}
						}

						response.writeHead(400)
						response.end()
						request.connection.destroy()

						serverManager.writeLog(serverManager.config.web.protocol, 400, appRequest, startTime, exception)
						return
					}

					let responseData = {}
					let sessionId = serverManager.validateSession(json.sessionId)

					let promises = json.actions.map((action) =>
					{
						let promise = new serverManager.Promise()

						promise.then((data) =>
						{
							responseData[action.requestId] = data
						})

						if (buffer[action.action] && buffer[action.action].parameters.equals(action.parameters))
						{
							promise.resolve(buffer[action.action].response)
							if (!buffer[action.action].isPermanent)
							{
								delete buffer[action.action]
							}
							return
						}

						setTimeout(() =>
						{
							_listener({
								sessionId: sessionId,
								action: action.action,
								parameters: action.parameters,
								inputDataLength: inputData.length,
								connection:
								{
									remoteAddress: request.connection.remoteAddress
								},
								buffer: (action, parameters, responseData, isPermanent) =>
								{
									buffer[action] = {
										parameters: parameters || {},
										response: responseData || {},
										isPermanent: isPermanent || false
									}
								},
								response: (data, status) =>
								{
									promise.resolve({
										status: status || 'ok',
										data: data || {}
									})
								},
								terminate: () =>
								{
									let appRequest = {
										action: action.action,
										parameters: action.parameters,
										inputDataLength: inputData.length,
										connection:
										{
											remoteAddress: request.connection.remoteAddress
										}
									}

									response.writeHead(400)
									response.end()
		
									serverManager.writeLog(serverManager.config.web.protocol, 400, appRequest, startTime)
								}
							}) // _listener()
						}) // setTimeout()
						
						return promise
					}) // json.actions.map()
					
					serverManager.Promise.all(promises).done(() =>
					{
						let remove = []
						let time = new Date().getTime()

						for (let b in _broadcasts)
						{
							if (time > _broadcasts[b].time)
							{
								remove.push(b)
								continue
							}

							if (_broadcasts[b].sessionIds)
							{
								let i = _broadcasts[b].sessionIds.indexOf(request.sessionId)

								if (i !== -1)
								{
									responseData[_broadcasts[b].requestId] = _broadcasts[b].data

									_broadcasts[b].sessionIds[i].splice(i, 1)
									if (_broadcasts[b].sessionIds === 0)
									{
										remove.push(b)
									}
								}
							}
							else
							{
								responseData[_broadcasts[b].requestId] = _broadcasts[b].data
							}
						}

						for (let r = remove.length; r > 0; r--)
						{
							_broadcasts.splice(r - 1, 1)
						}

						let outputJSON = {
							sessionId: sessionId,
							responses: responseData
						}

						if (Object.keys(buffer).length > 0)
						{
							outputJSON['buffer'] = buffer
						}

						let outputData = JSON.stringify(outputJSON)
						
						let appRequest = {
							action: json.actions.map((item) =>
								{
									return item.action
								}).join(' '),
							inputDataLength: inputData.length,
							outputDataLength: outputData.length,
							connection:
							{
								remoteAddress: request.connection.remoteAddress
							}
						}

						response.writeHead(200, { 'Content-Type': 'application/json' })
						response.write(outputData)
						response.end()

						serverManager.writeLog(serverManager.config.web.protocol, 200, appRequest, startTime)

					}) // serverManager.Promise.all().done()

				}) // request.on('end')

				return
			}

			serverManager.writeLog(serverManager.config.web.protocol, 405, request, startTime)
			response.writeHead(405)
			response.end()
		}
		catch (err)
		{
			serverManager.writeLog(serverManager.config.web.protocol, 500, request, startTime, err)
			response.writeHead(500)
			response.end()
		}
	}
}