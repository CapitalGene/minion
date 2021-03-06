# Change Log

## v0.3.0
* **worker**: instance of event emitter and emit `connection`
* **worker**: added options.handlePingTank which will add `PingTask` to `app`

## v0.2.2
* **deps**: broker-node#v0.0.10
* added .esformatter
* updated .eslintrc
* added .gitlab-ci.yml

## v0.2.1
* *Worker* `.execTask` will `ack` if no replyTo or correlationId

## v0.2.0
* [Task, Worker] Able to send delayed tasks by using `countdown`, `eta`
* [Task, Worker] Able to handle `rejection` by using `throw` or `Promise.reject` with `errors.Reject`
* [Task, Worker] Able to handle `retry` by using `throw` or `Promise.rejct` with `errors.Retry`
* [Task, Worker] Takes `options.requestTimeout` and will throw/reject with `errors.RequestTimeoutError` if task hasn't been returned within `requestTimeout (ms)`
* [package] `broker-node` v0.0.7
* Rewrote `Task`, `App`
    - Enable Defined Task can be attached to different Apps
    - Moved publish logic to `App`
* added jsdoc
