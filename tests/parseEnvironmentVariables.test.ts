import { test, expect, beforeAll, afterAll } from "bun:test";
import { parseEnvironmentVariables } from "../src/connections.js";

// Store original environment variables
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  // Save original environment variables
  for (const key of ["TEST_VAR_1", "TEST_VAR_2", "MISSING_VAR", "JUPYTER_TOKEN", "JUPYTER_PORT"]) {
    originalEnv[key] = process.env[key];
  }
  
  // Set test environment variables
  process.env.TEST_VAR_1 = "test-value-1";
  process.env.TEST_VAR_2 = "test-value-2";
  process.env.JUPYTER_TOKEN = "my-secret-token";
  process.env.JUPYTER_PORT = "8888";
  
  // Ensure MISSING_VAR is not set
  delete process.env.MISSING_VAR;
});

afterAll(() => {
  // Restore original environment variables
  for (const key of ["TEST_VAR_1", "TEST_VAR_2", "MISSING_VAR", "JUPYTER_TOKEN", "JUPYTER_PORT"]) {
    if (originalEnv[key] !== undefined) {
      process.env[key] = originalEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

test("parseEnvironmentVariables returns undefined when env is undefined", () => {
  const result = parseEnvironmentVariables(undefined);
  expect(result).toBeUndefined();
});

test("parseEnvironmentVariables returns undefined when env is empty object", () => {
  const result = parseEnvironmentVariables({});
  expect(result).toEqual({});
});

test("parseEnvironmentVariables preserves values without substitution", () => {
  const input = {
    STATIC_VALUE: "hello world",
    NUMBER_VALUE: "12345",
    URL_VALUE: "https://example.com/api"
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(input);
});

test("parseEnvironmentVariables substitutes existing environment variables", () => {
  const input = {
    STATIC: "static",
    SUBSTITUTED: "{env:TEST_VAR_1}",
    ANOTHER_SUB: "{env:TEST_VAR_2}"
  };
  
  const expected = {
    STATIC: "static",
    SUBSTITUTED: "test-value-1",
    ANOTHER_SUB: "test-value-2"
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(expected);
});

test("parseEnvironmentVariables substitutes multiple variables in same value", () => {
  const input = {
    COMBINED: "prefix-{env:TEST_VAR_1}-middle-{env:TEST_VAR_2}-suffix"
  };
  
  const expected = {
    COMBINED: "prefix-test-value-1-middle-test-value-2-suffix"
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(expected);
});

test("parseEnvironmentVariables replaces missing variables with empty string", () => {
  const input = {
    PRESENT: "{env:TEST_VAR_1}",
    MISSING: "{env:MISSING_VAR}",
    AFTER_MISSING: "value-after-{env:MISSING_VAR}"
  };
  
  const expected = {
    PRESENT: "test-value-1",
    MISSING: "",
    AFTER_MISSING: "value-after-"
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(expected);
});

test("parseEnvironmentVariables works with JupyterLab example from README", () => {
  const input = {
    JUPYTER_URL: "http://localhost:{env:JUPYTER_PORT}/",
    JUPYTER_TOKEN: "{env:JUPYTER_TOKEN}",
    ALLOW_IMG_OUTPUT: "true"
  };
  
  const expected = {
    JUPYTER_URL: "http://localhost:8888/",
    JUPYTER_TOKEN: "my-secret-token",
    ALLOW_IMG_OUTPUT: "true"
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(expected);
});

test("parseEnvironmentVariables handles database URL with multiple substitutions", () => {
  const input = {
    DATABASE_URL: "postgresql://{env:DB_USER}:{env:DB_PASS}@localhost:5432/mydb"
  };
  
  // Set up the environment variables for this test
  const originalDbUser = process.env.DB_USER;
  const originalDbPass = process.env.DB_PASS;
  
  try {
    process.env.DB_USER = "admin";
    process.env.DB_PASS = "secret123";
    
    const expected = {
      DATABASE_URL: "postgresql://admin:secret123@localhost:5432/mydb"
    };
    
    const result = parseEnvironmentVariables(input);
    expect(result).toEqual(expected);
  } finally {
    // Restore
    if (originalDbUser !== undefined) {
      process.env.DB_USER = originalDbUser;
    } else {
      delete process.env.DB_USER;
    }
    
    if (originalDbPass !== undefined) {
      process.env.DB_PASS = originalDbPass;
    } else {
      delete process.env.DB_PASS;
    }
  }
});

test("parseEnvironmentVariables handles empty values", () => {
  const input = {
    EMPTY_STRING: "",
    SPACES: "   "
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(input);
});

test("parseEnvironmentVariables is case-sensitive for variable names", () => {
  const input = {
    LOWERCASE: "{env:test_var_1}",  // Note: different case than TEST_VAR_1
  };
  
  const expected = {
    LOWERCASE: ""  // Should be empty because test_var_1 is not set
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(expected);
});

test("parseEnvironmentVariables handles complex patterns", () => {
  const input = {
    NESTED: "prefix-{env:TEST_VAR_1}-middle-{env:TEST_VAR_2}-suffix-{env:JUPYTER_TOKEN}",
    WITH_NUMBERS: "server-{env:JUPYTER_PORT}.example.com",
    MIXED: "{env:TEST_VAR_1}-{env:MISSING}-{env:TEST_VAR_2}"
  };
  
  const expected = {
    NESTED: "prefix-test-value-1-middle-test-value-2-suffix-my-secret-token",
    WITH_NUMBERS: "server-8888.example.com",
    MIXED: "test-value-1--test-value-2"
  };
  
  const result = parseEnvironmentVariables(input);
  expect(result).toEqual(expected);
});
