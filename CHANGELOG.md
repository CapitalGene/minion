# Change Log

## v0.2.0
* [Task, Worker] Able to send delayed tasks by using `countdown`, `eta`
* [Task, Worker] Able to handle `rejection` by using `throw` or `Promise.reject` with `errors.Reject`
* [Task, Worker] Able to handle `retry` by using `throw` or `Promise.rejct` with `errors.Retry`
* [package] `broker-node` v0.0.7
* Rewrote `Task`, `App`
    - Enable Defined Task can be attached to different Apps
    - Moved publish logic to `App`
