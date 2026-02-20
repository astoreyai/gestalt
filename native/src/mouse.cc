/**
 * Virtual mouse via Linux uinput.
 * Creates a virtual mouse device and provides move/click/scroll functions.
 */

#include <napi.h>
#include <fcntl.h>
#include <unistd.h>
#include <linux/uinput.h>
#include <cstring>
#include <cerrno>

static int uinput_fd = -1;

static void emit(int fd, int type, int code, int val) {
  struct input_event ie;
  memset(&ie, 0, sizeof(ie));
  ie.type = type;
  ie.code = code;
  ie.value = val;
  write(fd, &ie, sizeof(ie));
}

static void syn(int fd) {
  emit(fd, EV_SYN, SYN_REPORT, 0);
}

Napi::Value CreateMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  uinput_fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
  if (uinput_fd < 0) {
    Napi::Error::New(env, std::string("Failed to open /dev/uinput: ") + strerror(errno))
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  // Enable relative movement events
  ioctl(uinput_fd, UI_SET_EVBIT, EV_REL);
  ioctl(uinput_fd, UI_SET_RELBIT, REL_X);
  ioctl(uinput_fd, UI_SET_RELBIT, REL_Y);
  ioctl(uinput_fd, UI_SET_RELBIT, REL_WHEEL);

  // Enable button events
  ioctl(uinput_fd, UI_SET_EVBIT, EV_KEY);
  ioctl(uinput_fd, UI_SET_KEYBIT, BTN_LEFT);
  ioctl(uinput_fd, UI_SET_KEYBIT, BTN_RIGHT);
  ioctl(uinput_fd, UI_SET_KEYBIT, BTN_MIDDLE);

  struct uinput_setup usetup;
  memset(&usetup, 0, sizeof(usetup));
  usetup.id.bustype = BUS_USB;
  usetup.id.vendor = 0x1234;
  usetup.id.product = 0x5678;
  snprintf(usetup.name, UINPUT_MAX_NAME_SIZE, "Tracking Virtual Mouse");

  ioctl(uinput_fd, UI_DEV_SETUP, &usetup);
  ioctl(uinput_fd, UI_DEV_CREATE);

  return Napi::Boolean::New(env, true);
}

Napi::Value MoveMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (uinput_fd < 0) {
    Napi::Error::New(env, "Mouse not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  int dx = info[0].As<Napi::Number>().Int32Value();
  int dy = info[1].As<Napi::Number>().Int32Value();

  emit(uinput_fd, EV_REL, REL_X, dx);
  emit(uinput_fd, EV_REL, REL_Y, dy);
  syn(uinput_fd);

  return env.Undefined();
}

Napi::Value ClickMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (uinput_fd < 0) {
    Napi::Error::New(env, "Mouse not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  int button = BTN_LEFT;
  if (info.Length() > 0) {
    std::string btn = info[0].As<Napi::String>().Utf8Value();
    if (btn == "right") button = BTN_RIGHT;
    else if (btn == "middle") button = BTN_MIDDLE;
  }

  emit(uinput_fd, EV_KEY, button, 1); // Press
  syn(uinput_fd);
  emit(uinput_fd, EV_KEY, button, 0); // Release
  syn(uinput_fd);

  return env.Undefined();
}

Napi::Value ScrollMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (uinput_fd < 0) {
    Napi::Error::New(env, "Mouse not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  int amount = info[0].As<Napi::Number>().Int32Value();
  emit(uinput_fd, EV_REL, REL_WHEEL, amount);
  syn(uinput_fd);

  return env.Undefined();
}

Napi::Value DestroyMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (uinput_fd >= 0) {
    ioctl(uinput_fd, UI_DEV_DESTROY);
    close(uinput_fd);
    uinput_fd = -1;
  }
  return env.Undefined();
}

Napi::Object InitMouse(Napi::Env env, Napi::Object exports) {
  Napi::Object mouse = Napi::Object::New(env);
  mouse.Set("create", Napi::Function::New(env, CreateMouse));
  mouse.Set("move", Napi::Function::New(env, MoveMouse));
  mouse.Set("click", Napi::Function::New(env, ClickMouse));
  mouse.Set("scroll", Napi::Function::New(env, ScrollMouse));
  mouse.Set("destroy", Napi::Function::New(env, DestroyMouse));
  exports.Set("mouse", mouse);
  return exports;
}
