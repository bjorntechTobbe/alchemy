import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

/**
 * HTTP-triggered Azure Function
 * 
 * This function responds to HTTP requests with a greeting message.
 * It demonstrates basic Azure Function HTTP triggers.
 */
export async function httpTrigger(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`HTTP function processed request for url "${request.url}"`);

  const name = request.query.get("name") || (await request.text()) || "World";

  return {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Hello, ${name}!`,
      timestamp: new Date().toISOString(),
      functionName: context.functionName,
      invocationId: context.invocationId,
    }),
  };
}

app.http("httpTrigger", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: httpTrigger,
});
