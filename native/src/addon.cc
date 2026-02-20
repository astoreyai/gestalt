/**
 * N-API entry point for the tracking_input native addon.
 * Exposes virtual mouse and keyboard functions via uinput on Linux.
 */

#include <napi.h>

// Forward declarations from mouse.cc and keyboard.cc
Napi::Object InitMouse(Napi::Env env, Napi::Object exports);
Napi::Object InitKeyboard(Napi::Env env, Napi::Object exports);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  InitMouse(env, exports);
  InitKeyboard(env, exports);
  return exports;
}

NODE_API_MODULE(tracking_input, Init)
