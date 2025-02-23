# interaction-router

## What is this

This is a small router for discord interactions to callbacks, aimed for use in
a serverless environment.

It provides:
- good typing support
- simple routing of interactions to callback functions
- relatively flexible routing of component/modal callbacks by custom ID

It does not provide:
- request verification (use other packages in this collection)
- a bot client (you can provide one in as a context object)
- registration (though it'll provide the necessary JSON in a convenient format
  for use with your own client)

## How do I use this?

The most effective way would be to read the source of the `example-app`
package.
