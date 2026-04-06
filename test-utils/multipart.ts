function escapeHeaderValue(value: string): string {
  return value.replace(/"/g, "%22");
}

export async function serializeFormData(formData: FormData): Promise<{
  body: Buffer;
  contentType: string;
}> {
  const boundary = `----flatfile-sql-studio-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${escapeHeaderValue(name)}"\r\n\r\n${value}\r\n`,
          "utf8",
        ),
      );
      continue;
    }

    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${escapeHeaderValue(name)}"; filename="${escapeHeaderValue(value.name)}"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(Buffer.from(await value.arrayBuffer()));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function createMultipartRequest(
  url: string,
  formData: FormData,
): Promise<Request> {
  const { body, contentType } = await serializeFormData(formData);

  return new Request(url, {
    body: new Uint8Array(body),
    headers: {
      "content-length": String(body.length),
      "content-type": contentType,
    },
    method: "POST",
  });
}
