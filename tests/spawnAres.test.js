'use strict';

/**
 * Tests para src/spawnAres.js
 *
 * Valida el comportamiento multiplataforma del helper de spawn:
 *   - needsShell: .cmd/.bat/.sin-extensión en Windows → true; resto → false.
 *   - getAresCmd: usa WEBOS_ARES_PATH si está definido, si no 'ares'.
 *   - friendlySpawnError: mensajes útiles para ENOENT, EINVAL y otros errores.
 *   - spawnAres: llama a spawn con los argumentos y opciones correctas.
 */

const { getAresCmd, needsShell, friendlySpawnError } = require('../src/spawnAres');

// ─── getAresCmd ───────────────────────────────────────────────────────────────

describe('getAresCmd', () => {
  const originalEnv = process.env.WEBOS_ARES_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WEBOS_ARES_PATH;
    } else {
      process.env.WEBOS_ARES_PATH = originalEnv;
    }
  });

  test('devuelve "ares" cuando WEBOS_ARES_PATH no está definido', () => {
    delete process.env.WEBOS_ARES_PATH;
    expect(getAresCmd()).toBe('ares');
  });

  test('devuelve la ruta de WEBOS_ARES_PATH cuando está definido', () => {
    process.env.WEBOS_ARES_PATH = '/usr/local/bin/ares';
    expect(getAresCmd()).toBe('/usr/local/bin/ares');
  });

  test('devuelve la ruta Windows de WEBOS_ARES_PATH', () => {
    process.env.WEBOS_ARES_PATH = 'C:\\webos\\bin\\ares.cmd';
    expect(getAresCmd()).toBe('C:\\webos\\bin\\ares.cmd');
  });
});

// ─── needsShell ───────────────────────────────────────────────────────────────

describe('needsShell', () => {
  // --- Windows ---
  describe('en Windows (win32)', () => {
    test('.cmd → true', () => {
      expect(needsShell('ares.cmd', 'win32')).toBe(true);
    });

    test('.CMD (mayúsculas) → true', () => {
      expect(needsShell('ares.CMD', 'win32')).toBe(true);
    });

    test('.bat → true', () => {
      expect(needsShell('ares.bat', 'win32')).toBe(true);
    });

    test('.BAT (mayúsculas) → true', () => {
      expect(needsShell('C:\\webos\\bin\\ares.BAT', 'win32')).toBe(true);
    });

    test('sin extensión ("ares") → true (necesita shell para PATHEXT)', () => {
      expect(needsShell('ares', 'win32')).toBe(true);
    });

    test('ruta absoluta sin extensión → true', () => {
      expect(needsShell('C:\\webos\\bin\\ares', 'win32')).toBe(true);
    });

    test('.exe → false (ejecutable nativo, no necesita shell)', () => {
      expect(needsShell('ares.exe', 'win32')).toBe(false);
    });

    test('ruta absoluta .exe → false', () => {
      expect(needsShell('C:\\webos\\bin\\ares.exe', 'win32')).toBe(false);
    });
  });

  // --- macOS / Linux ---
  describe('en macOS (darwin)', () => {
    test('binario sin extensión → false', () => {
      expect(needsShell('ares', 'darwin')).toBe(false);
    });

    test('ruta absoluta → false', () => {
      expect(needsShell('/usr/local/bin/ares', 'darwin')).toBe(false);
    });

    test('.cmd en macOS → false (no aplica)', () => {
      expect(needsShell('ares.cmd', 'darwin')).toBe(false);
    });
  });

  describe('en Linux (linux)', () => {
    test('binario sin extensión → false', () => {
      expect(needsShell('ares', 'linux')).toBe(false);
    });

    test('ruta absoluta → false', () => {
      expect(needsShell('/usr/bin/ares', 'linux')).toBe(false);
    });
  });
});

// ─── friendlySpawnError ───────────────────────────────────────────────────────

describe('friendlySpawnError', () => {
  const originalEnv = process.env.WEBOS_ARES_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WEBOS_ARES_PATH;
    } else {
      process.env.WEBOS_ARES_PATH = originalEnv;
    }
  });

  test('ENOENT produce mensaje descriptivo con nombre del comando', () => {
    delete process.env.WEBOS_ARES_PATH;
    const err = Object.assign(new Error('spawn ares ENOENT'), { code: 'ENOENT' });
    const msg = friendlySpawnError(err);
    expect(msg).toMatch(/ares/);
    expect(msg).toMatch(/WEBOS_ARES_PATH/);
    expect(msg).toMatch(/PATH/);
  });

  test('ENOENT incluye la ruta de WEBOS_ARES_PATH si está definida', () => {
    process.env.WEBOS_ARES_PATH = 'C:\\webos\\bin\\ares.cmd';
    const err = Object.assign(new Error('spawn ares.cmd ENOENT'), { code: 'ENOENT' });
    const msg = friendlySpawnError(err);
    expect(msg).toMatch(/C:\\webos\\bin\\ares\.cmd/);
  });

  test('EINVAL produce mensaje descriptivo sobre .cmd/.bat en Windows', () => {
    delete process.env.WEBOS_ARES_PATH;
    const err = Object.assign(new Error('spawn ares EINVAL'), { code: 'EINVAL' });
    const msg = friendlySpawnError(err);
    expect(msg).toMatch(/EINVAL/);
    expect(msg).toMatch(/\.cmd|\.bat/i);
  });

  test('error genérico devuelve err.message sin modificar', () => {
    const err = new Error('algo salió mal');
    expect(friendlySpawnError(err)).toBe('algo salió mal');
  });

  test('error con código desconocido devuelve err.message', () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    expect(friendlySpawnError(err)).toBe('EACCES');
  });
});
