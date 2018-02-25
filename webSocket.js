'use strict';

const $ws = require('ws');
const $Uuidv1 = require('uuid/v1');

module.exports = (serverManager) =>
{
	let _webSockets = {};
	let _listener = (request) =>
		{
			console.log('default webSocket listener', request);
			request.response({}, 'ok');
		};

	(new $ws.Server({ server: serverManager.webServer }))
		.on('connection', (webSocket) =>
		{
			webSocket
				.on('message', (message) =>
				{
					if (message.length > serverManager.config.web.messageSizeLimit)
					{
						serverManager.writeLog('ws', 'message-too-large', appRequest, startTime);
						webSocket.terminate();
						return;
					}

					let startTime = new Date().getTime();
					let appRequest;
					
					try
					{
						let json = JSON.parse(message);
						let buffer = {};

						appRequest = {
							requestId: json.requestId,
							userId: json.userId,
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
								};
							},
							response: (data, status) =>
							{
								let outputJSON = {
									requestId: appRequest.requestId,									
									userId: appRequest.userId,
									status: status || 'ok',
									data: data || {}
								};

								if (Object.keys(buffer).length > 0)
								{
									outputJSON['buffer'] = buffer;
								}

								let outputData = JSON.stringify(outputJSON);

								appRequest.outputDataLength = outputData.length;

								webSocket.send(outputData);

								serverManager.writeLog('ws', 'response', appRequest, startTime);
							},
							terminate: () =>
							{
								serverManager.writeLog('ws', 'terminate-force', appRequest, startTime);
								webSocket.terminate();
							}
						};
					}
					catch (err)
					{
						serverManager.writeLog('ws', 'error', appRequest, startTime, err);
						webSocket.terminate();
						return;
					}

					if (!appRequest.requestId)
					{
						serverManager.writeLog('ws', 'missing-requestId', appRequest, startTime);
						webSocket.terminate();
						return;
					}
					if (!appRequest.action)
					{
						serverManager.writeLog('ws', 'missing-action', appRequest, startTime);
						webSocket.terminate();
						return;
					}

					if (webSocket.userId && appRequest.userId && webSocket.userId !== appRequest.userId)
					{
						serverManager.writeLog('ws', 'invalid-userId', appRequest, startTime);
						webSocket.terminate();
						delete _webSockets[webSocket.userId];
						return;
					}
					else if (appRequest.userId)
					{
						webSocket.userId = appRequest.userId = appRequest.userId || $Uuidv1();

						if (_webSockets[webSocket.userId] && _webSockets[webSocket.userId].webSocket !== webSocket)
						{
							serverManager.writeLog('ws', 'terminate-old', appRequest, startTime);
							_webSockets[webSocket.userId].webSocket.terminate();
						}
	
						_webSockets[webSocket.userId] = {
							webSocket: webSocket
						};
					}
					else
					{
						webSocket.userId = appRequest.userId = webSocket.userId || $Uuidv1();
						_webSockets[webSocket.userId] = {
							webSocket: webSocket
						};
					}

					setTimeout(() =>
					{
						_listener(appRequest);
					});
				})
				.on('close', () =>
				{
					if (webSocket.userId)
					{
						_webSockets[webSocket.userId] = null;
					}
				});
		});

	console.log('WebSocket - attached to WebServer');	

	return {
		setListener: (callback) =>
		{
			_listener = callback;
		},
		setUserGroup: (userId, groupId) =>
		{
			_webSockets[userId].group = groupId;
		},
		broadcast: (groupId, dataType, data) =>
		{
			let startTime = new Date().getTime();
			let appRequest = {
				action: 'broadcast',
				method: groupId,
				outputDataLength: JSON.stringify(data).length
			};

			for (let userId in _webSockets)
			{
				if (groupId == null || _webSockets[userId].groupId === groupId)
				{
					_webSockets[userId].webSocket.send(JSON.stringify({
						requestId: dataType,
						userId: userId,
						status: 'ok',
						data: data
					}));
				}
			}

			serverManager.writeLog('ws', 'broadcast', appRequest, startTime);
		} // broadcast		
	};
};
