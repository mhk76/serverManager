module.exports = function Promise()
{
	let promise = this

	promise.resolved = false
	promise.failed = false

	promise.then = (callback) =>
	{
		promise.successCallback = callback

		if (promise.resolved)
		{
			return callback(promise.result)
		}

		return promise
	}

	promise.catch = (callback) =>
	{
		promise.failCallback = callback

		if (promise.failed)
		{
			return callback(promise.error)
		}

		return promise
	}

	promise.resolve = (data) =>
	{
		promise.resolved = true
		promise.failed = false
		promise.result = data

		delete promise.error

		if (promise.successCallback)
		{
			promise.successCallback(data)
		}
		if (promise.allCallback)
		{
			promise.allCallback()
			delete promise.allCallback
		}
	}

	promise.reject = (error) =>
	{
		promise.resolved = false
		promise.failed = true
		promise.error = error

		delete promise.result

		if (promise.failCallback)
		{
			promise.failCallback(error)
		}
		if (promise.allCallback)
		{
			promise.allCallback()
			delete promise.allCallback
		}
	}

	Promise.all = (list) =>
	{
		if (!Array.isArray(list))
		{
			throw 'Not an array'
		}

		let results = new Array(list.length)
		let all = {
			count: list.length,
			done: (callback) =>
			{
				if (all.count === 0)
				{
					callback(results)
					return
				}

				all.callback = callback
			}
		}

		list.forEach((promise, index) =>
		{
			if (promise.resolved || promise.failed)
			{
				--all.count

				results[index] = promise.result

				if (all.count === 0)
				{
					all.callback(results)
				}
				return
			}

			promise.allCallback = () =>
			{
				--all.count
				
				results[index] = promise.result

				if (all.count === 0)
				{
					all.callback(results)
				}
			}
		})

		return all
	}

}