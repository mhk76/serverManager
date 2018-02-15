const $ws = require('ws');

const Uuidv1 = require('uuid/v1');

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
							inputDataLength: message.length,
							parameters: json.parameters,
							connection:
							{
								remoteAddress: webSocket && webSocket._socket && webSocket._socket.remoteAddress
							},
							buffer: (action, parameters, response, isPermanent) =>
							{
								buffer[action] = {
									parameters: parameters || {},
									response: response || {},
									isPermanent: isPermanent || false
								};
							},
							response: (data, status) =>
							{
								let outputData = JSON.stringify({
									requestId: appRequest.requestId,									
									userId: appRequest.userId,
									status: status || 'ok',
									data: data || {}
								});

								if (Object.keys(buffer).length > 0)
								{
									outputData['buffer'] = buffer;
								}

								appRequest.outputDataLength = outputData.length;

								serverManager.writeLog('$ws', 'response', appRequest, startTime);

								webSocket.send(outputData);
							},
							terminate: () =>
							{
								serverManager.writeLog('$ws', 'terminate-force', appRequest, startTime);
								webSocket.terminate();
							}
						};
					}
					catch (err)
					{
						serverManager.writeLog('$ws', 'error', appRequest, startTime, err);
						webSocket.terminate();
						return;
					}

					if (!appRequest.requestId)
					{
						serverManager.writeLog('$ws', 'missing-requestId', appRequest, startTime);
						webSocket.terminate();
						return;
					}
					if (!appRequest.action)
					{
						serverManager.writeLog('$ws', 'missing-action', appRequest, startTime);
						webSocket.terminate();
						return;
					}
					if (webSocket.userId && webSocket.userId !== appRequest.userId)
					{
						serverManager.writeLog('$ws', 'invalid-userId', appRequest, startTime);
						webSocket.terminate();
						delete _webSockets[webSocket.userId];
						return;
					}
					
					if (!appRequest.userId)
					{
						appRequest.userId = Uuidv1(); 
					}
					webSocket.userId = appRequest.userId;

					if (_webSockets[webSocket.userId] && _webSockets[webSocket.userId].webSocket !== webSocket)
					{
						serverManager.writeLog('$ws', 'terminate-old', appRequest, startTime);
						_webSockets[webSocket.userId].webSocket.terminate();
					}

					_webSockets[webSocket.userId] = {
						target: null,
						webSocket: webSocket
					};

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
		setUserTarget: (userId, target) =>
		{
			_webSockets[userId].target = target;
		},
		broadcast: (target, dataType, data) =>
		{
			for (let userId in _webSockets)
			{
				if (_webSockets[userId] && _webSockets[userId].target === target)
				{
					_webSockets[userId].send(JSON.stringify({
						requestId: dataType,
						userId: userId,
						status: 'broadcast',
						data: data
					}));
				}
			}
		}
	};
};
