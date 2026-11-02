// What one request line in the server log may contain.
import { describe, expect, it } from "vitest";
import { httpLogSerializers } from "../../src/lib/logger.js";

describe("request log lines", () => {
  it("leave out headers, so a session cookie never reaches the logs", () => {
    const line = httpLogSerializers.req({ id: 1, method: "GET", url: "/api/clients", remoteAddress: "203.0.113.5", headers: { cookie: "vx_session=s3cret", "user-agent": "Safari" } });
    expect(line).toEqual({ id: 1, method: "GET", url: "/api/clients", remoteAddress: "203.0.113.5", userAgent: "Safari" });
    expect(JSON.stringify(line)).not.toContain("s3cret");
  });

  it("hide secret query values: the calendar token and the Google code and state", () => {
    expect(httpLogSerializers.req({ url: "/api/auth/google/callback?state=abc&code=4/0Ab&scope=email" }).url).toBe(
      "/api/auth/google/callback?state=[hidden]&code=[hidden]&scope=email",
    );
    expect(httpLogSerializers.req({ url: "/api/integrations/x/calendar.ics?token=t0p" }).url).toBe("/api/integrations/x/calendar.ics?token=[hidden]");
  });

  it("keep only the status of a response, not the cookies it sets", () => {
    const res = { statusCode: 200, headers: { "set-cookie": "vx_session=s3cret" } };
    expect(httpLogSerializers.res(res)).toEqual({ statusCode: 200 });
  });
});
