'use strict'

exports.serverManagerTools = (function()
{
	let _buffer = {}
	let _eventConnect = new Event('websocket_onconnect')
	let _eventDisconnect = new Event('websocket_ondisconnect')
	let _httpSendTimer = null
	let _httpSendBuffer = []
	let _httpSendPromises = {}
	let _serverPromise
	let _webSocket
	let _webSocketListeners = {}
	let _webSocketPromise
	let _webSocketProtocol = (location.protocol === 'https' ? 'wss://' : 'ws://')
	let _webSocketRequests = {}

	const $tools = {
		'cookie': 
		{
			'read': (name) =>
			{
				let match = escape(name) + '='

				document.cookie.split('; ').foreach((cookie) =>
				{
					if (cookie.substr(0, match.length) === match)
					{
						return unescape(cookie.substr(match.length))
					}
				})
			},
			'write': (name, value, age) =>
			{
				document.cookie = escape(name) + '=' + escape(value) + (age ? '; max-age=' + age : '')
			},
			'delete': (name) =>
			{
				document.cookie = escape(name) + '=; max-age=-1'
			}
		}, // cookie
		
		'http':
		{
			'options': {
				postDelay: 10,
				permanentId: false
			},
			'fetch': (action, parameters) =>
			{
				if (_buffer[action] && _tools.equals(parameters, _buffer[action].parameters))
				{
					let promise = Promise.resolve(_buffer[action].response)

					if (!_buffer[action].isPermanent)
					{
						delete _buffer[action]
					}
					
					return promise
				}

				return new Promise((resolve, reject) =>
				{
					let requestId = new Date().getTime() + Math.random()
					let userId

					_httpSendPromises[requestId] = { resolve, reject }
					
					if (localStorage && localStorage.getItem)
					{
						userId = localStorage.userId
					}
					else
					{
						userId = cookie.read('userId')
					}

					let requestData = {
						requestId: requestId,
						action: action
					}

					if (parameters)
					{
						requestData.parameters = parameters
					}

					_httpSendBuffer.push(requestData)

					if (_httpSendTimer)
					{
						clearTimeout(_httpSendTimer)
					}

					_httpSendTimer = setTimeout(() =>
						{
							clearTimeout(_httpSendTimer)
							_httpSendTimer = null

							let sendData = {
								actions: _httpSendBuffer
							}

							if (userId)
							{
								sendData.userId = userId
							}

							fetch(
								'/',
								{
									method: 'POST',
									cache: 'no-cache',
									body: JSON.stringify(sendData)
								}
							)
							.then(
								(responseData) =>
								{
									if (responseData.userId)
									{
										if ($tools.http.options.permanentId && localStorage && localStorage.setItem)
										{
											localStorage.setItem('userId', responseData.userId)
										}
										else if (sessionStorage && sessionStorage.setItem)
										{
											sessionStorage.setItem('userId', responseData.userId)
										}
										else
										{
											cookie.write('userId', responseData.userId, $tools.http.options.permanentId && (86400 * 365 * 10))
										}
									}

									Object.assign(_buffer, responseData.buffer)
									
									for (let requestId in responseData.responses)
									{
										let response = responseData.responses[requestId]

										if (response.status === 'error') 
										{
											_httpSendPromises[requestId].reject(response.data)
											return
										}
					
										_httpSendPromises[requestId].resolve(response.data)
										delete _httpSendPromises[requestId]
									}
								},
								(response) =>
								{
									sendData.actions.forEach((action) =>
									{
										_httpSendPromises[action.requestId].reject(response.statusText)
									})
								}
							) // fetch().then()

							_httpSendBuffer = []
						}, // setTimeout(() => {})
						$tools.http.options.postDelay || 10
					) // setTimeout
				})
			} // .fetch()
		}, // http
		
		'webSocket':
		{
			'options': {},
			'loader': new Promise((resolve, reject) =>
			{
				_webSocketPromise = { resolve, reject }
			}),
			'supported': !!WebSocket,
			'start': (options) =>
			{
				$tools.webSocket.optios = options
				_webSocket = new connectWebSocket()
				return _webSocketPromise
			},
			'addListener': (key, callback) =>
			{
				_webSocketListeners[key] = callback
			},
			'fetch': (action, parameters) =>
			{
				if (_buffer[action] && $.equals(parameters, _buffer[action].parameters))
				{
					let promise = Promise.resolve(_buffer[action].response)

					if (!_buffer[action].isPermanent)
					{
						delete _buffer[action]
					}
					
					return promise
				}

				let sendData = {
					requestId: new Date().getTime() + Math.random(),
					action: action
				}

				let userId

				if (localStorage && localStorage.getItem)
				{
					userId = localStorage.userId
				}
				else if (sessionlStorage && sessionlStorage.getItem)
				{
					userId = sessionlStorage.userId
				}
				else
				{
					userId = cookie.read('userId')
				}
				if (userId)
				{
					sendData.userId = userId
				}

				if (parameters)
				{
					sendData.parameters = parameters
				}
					
				let promise = new Promise((resolve, reject) =>
				{
					_webSocketRequests[sendData.requestId] = { resolve, reject }
				})
				.catch((error) => { })

				if (_webSocket.readyState === 1)
				{
					_webSocket.send(JSON.stringify(sendData))
				}
				else
				{
					promise.reject()
				}

				return promise
			} // .fetch
		}, // .webSocket

		'server':
		{
			'loader': new Promise((resolve, reject) =>
			{
				_serverPromise = { resolve, reject }
			}),
			'start': (options) =>
			{
				let services = []

				options = options || {}
				options.webSocket = !!options.webSocket && $tools.webSocket.supported

				$tools.http.options = options

				if (options.webSocket)
				{
					services.push($tools.webSocket.start(options))
				}

				Promise.all(services).then(() =>
				{
					if (options.webSocket)
					{
						$tools.server.fetch = $tools.webSocket.fetch
						$tools.server.addListener = $tools.webSocket.addListener
						$tools.server.usingWebSocket = true
					}
					else
					{
						$tools.server.fetch = $tools.http.fetch
						$tools.server.addListener = () => { }
						$tools.server.usingWebSocket = false
					}

					_serverPromise.resolve()
				})

				return _serverPromise
			},
			'readStore': (name, defaultValue) =>
			{
				let value

				if (localStorage && localStorage.getItem)
				{
					value = localStorage.getItem(name)
				}
				else
				{
					value = cookie.read(name)
				}
				if (value === undefined)
				{
					return defaultValue
				}
				try
				{
					return JSON.parse(value)
				}
				catch(err)
				{
					return defaultValue
				}
			},
			'writeStore': (name, data, isPermanent) =>
			{
				if (isPermanent && localStorage && localStorage.setItem)
				{
					localStorage.setItem(name, JSON.stringify(data))
					return
				}
				if (sessionStorage && sessionStorage.setItem)
				{
					sessionStorage.setItem(name, JSON.stringify(data))
					return
				}

				cookie.write(name, JSON.stringify(data), isPermanent)
			},
			'deleteStore': (name) =>
			{
				if (localStorage && localStorage.deleteItem)
				{
					delete localStorage.deleteItem(name)
				}
				else
				{
					cookie.delete(name)
				}
			}
		}, // .server

		'equals': (object1, object2, softComparison) =>
		{
			if (object1 === object2 || (softComparison && object1 == object2))
			{
				return true
			}
			if (isNaN(object1))
			{
				return isNaN(object2)
			}
		
			let type1 = typeof object1
		
			if (type1 !== typeof object2 || ['string', 'number', 'boolean'].includes(type1) || ['string', 'number', 'boolean'].includes(type2))
			{
				return false
			}
			if (Array.isArray(object1))
			{
				if (!Array.isArray(object2))
				{
					return false
				}
				if (object1.length !== object2.length)
				{
					return false
				}
			
				return object1.every((value, index) =>
				{
					return _tools.equals(value, object2[index], softComparison)
				})
			}
			if (object1 instanceof Date)
			{
				return +object1 === +object2
			}
			if (object1 instanceof Function || object2 instanceof Function)
			{
				return false
			}
		
			const keys1 = Object.getOwnPropertyNames(object1)
			const keys2 = Object.getOwnPropertyNames(object2)
			
			if (keys1.length !== keys2.length)
			{
				return false
			}

			return keys1.every((key, index) =>
			{
				if (key !== keys[index])
				{
					return false
				}
				if (object1[key] instanceof Function)
				{
					return object2[key] instanceof Function
				}
				return _tools.equals(object1[key], object2[key], softComparison)
			})
		} 
	}

	if (!$tools.webSocket.supported)
	{
		_webSocketPromise.resolve()
	}

	return $tools


	function connectWebSocket()
	{
		let webSocket = new WebSocket(_webSocketProtocol + location.host)

		webSocket.onmessage = (messageEvent) =>
		{
			try
			{
				let responseData = JSON.parse(messageEvent.data)
				let promise = _webSocketRequests[responseData.requestId]

				if (responseData.status === 'error') 
				{
					promise.reject(responseData.data)
					return
				}

				if (responseData.buffer)
				{
					Object.assign(_buffer, responseData.buffer)
				}

				if (responseData.userId)
				{
					if ($tools.webSocket.options.permanentId && localStorage && localStorage.setItem)
					{
						localStorage.setItem('userId', responseData.userId)
					}
					else if (sessionStorage && sessionStorage.setItem)
					{
						sessionStorage.setItem('userId', responseData.userId)
					}
					else
					{
						cookie.write('userId', responseData.userId, $tools.webSocket.options.permanentId && (86400 * 365 * 10))
					}
				}

				for (let key in _webSocketListeners)
				{
					if (key === responseData.requestId)
					{
						_webSocketListeners[key](responseData.data)
						return
					}
				}

				promise.resolve(responseData.data)
			}
			catch (err)
			{
				console.log(err)
			}
		}

		webSocket.onopen = () =>
		{
			document.dispatchEvent(_eventConnect)
			_webSocketPromise.resolve()
		}

		webSocket.onclose = () =>
		{
			if (document.dispatchEvent(_eventDisconnect))
			{
				_webSocket = new connectWebSocket()
			}
		}

		return webSocket
	}

})()