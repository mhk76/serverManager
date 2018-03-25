'use strict'

exports.start = (serverManager) =>
{
	serverManager.setListener((request) =>
	{
		switch (request.action)
		{
			case 'zero':
				request.buffer('buffer', 'values', 'data')
				request.response('zero')
				serverManager.broadcast(null, 'all', 'broadcast')
				break
			case 'one':
				request.buffer('buffer', 'values', 'data')
				setTimeout(
					() =>
					{
						request.response('one')
					},
					100
				)
				break
			case 'two':
				setTimeout(
					() =>
					{
						request.response('two')
					},
					200
				)
				break
			case 'three':
				setTimeout(
					() =>
					{
						request.response('three')
					},
					300
				)
				break
			case 'save':
				serverManager.cache(request.userId, request.parameters)
				break
			case 'load':
				request.response(serverManager.cache(request.userId))
		}
	})
}