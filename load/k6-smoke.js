import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "30s", target: 0 }
  ]
};

export default function () {
  const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
  const responses = [http.get(`${baseUrl}/`), http.get(`${baseUrl}/student`), http.get(`${baseUrl}/admin`), http.get(`${baseUrl}/api/health`)];

  for (const response of responses) {
    check(response, {
      "status is 200": (res) => res.status === 200
    });
  }

  sleep(1);
}
