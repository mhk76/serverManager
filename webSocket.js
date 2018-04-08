'use strict'

const $ws = require('ws')

module.exports = (serverManager) =>
{
	let _webSockets = new Map()
	let _listener = (request) =>
		{
			console.log('default webSocket listener', request)
			request.response({}, 'ok')
		}

	(new $ws.Server({ server: serverManager.webServer }))
		.on('connection', (webSocket) =>
		{
			webSocket
				.on('message', (message) =>
				{
					if (message.length > serverManager.config.web.messageSizeLimit)
					{
						serverManager.writeLog('ws', 'message-too-large', appRequest, startTime)
						webSocket.terminate()
						return
					}

					let startTime = new Date().getTime()
					let appRequest
					
					try
					{
						let json = JSON.parse(message)
						let buffer = {}

						appRequest = {
							requestId: json.requestId,
							action: json.action,
							parameters: json.parameters,
							inputDataLength: message.length,
							connection:
							{
								remoteAddress: webSocket._socket && webSocket._socket.remoteAddress
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
								let outputJSON = {
									sessionId: webSocket.sessionId,
									requestId: appRequest.requestId,
									status: status || 'ok',
									data: data || {}
								}

								if (Object.keys(buffer).length > 0)
								{
									outputJSON['buffer'] = buffer
								}

								let outputData = JSON.stringify(outputJSON)

								appRequest.outputDataLength = outputData.length

								webSocket.send(outputData)

								serverManager.writeLog('ws', 'response', appRequest, startTime)
							},
							terminate: () =>
							{
								serverManager.writeLog('ws', 'terminate-force', appRequest, startTime)
								webSocket.terminate()
							}
						}
					}
					catch (err)
					{
						serverManager.writeLog('ws', 'error', appRequest, startTime, err)
						webSocket.terminate()
						return
					}

					if (!appRequest.requestId)
					{
						serverManager.writeLog('ws', 'missing-requestId', appRequest, startTime)
						webSocket.terminate()
						return
					}
					if (!appRequest.action)
					{
						serverManager.writeLog('ws', 'missing-action', appRequest, startTime)
						webSocket.terminate()
						return
					}

					if (!webSocket.sessionId)
					{
						webSocket.sessionId = serverManager.validateSession()
						_webSockets.set(
							webSocket.sessionId,
							{
								webSocket: webSocket,
								groups: []
							}
						)
					}

					appRequest.sessionId = webSocket.sessionId

					setTimeout(() =>
					{
						_listener(appRequest)
					})
				})
				.on('close', () =>
				{
					serverManager.releaseSession(webSocket.sessionId)
					_webSockets.delete(webSocket.sessionId)
				})
		})

	console.log('WebSocket - attached to WebServer')	

	return {
		setListener: (callback) =>
		{
			_listener = callback
		},
		addUserGroup: (sessionId, groupId) =>
		{
			_webSockets.get(sessionId).groups.push(groupId)
		},
		broadcast: (groupId, dataType, data) =>
		{
			let startTime = new Date().getTime()
			let appRequest = {
				action: 'broadcast',
				method: groupId,
				outputDataLength: JSON.stringify(data || '').length
			}

			_webSockets.forEach((data, sessionId) =>
			{
				if (groupId == null || data.groups.includes(groupId))
				{
					data.webSocket.send(JSON.stringify({
						requestId: dataType,
						sessionId: sessionId,
						status: 'ok',
						data: data
					}))
				}
			})

			serverManager.writeLog('ws', 'broadcast', appRequest, startTime)
		} // broadcast		
	}
}
