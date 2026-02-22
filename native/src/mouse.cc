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
#include <sys/time.h>

static int uinput_fd = -1;

static int emit(int fd, int type, int code, int val) {
  struct input_event ie = {};
  ie.type = type;
  ie.code = code;
  ie.value = val;
  gettimeofday(&ie.time, NULL);
  ssize_t ret;
  do {
    ret = write(fd, &ie, sizeof(ie));
  } while (ret < 0 && errno == EINTR);
  return (ret == (ssize_t)sizeof(ie)) ? 0 : -1;
}

static int syn(int fd) {
  return emit(fd, EV_SYN, SYN_REPORT, 0);
}

Napi::Value CreateMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Close existing FD to prevent leak if create() is called multiple times
  if (uinput_fd >= 0) {
    ioctl(uinput_fd, UI_DEV_DESTROY);
    close(uinput_fd);
    uinput_fd = -1;
  }

  uinput_fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
  if (uinput_fd < 0) {
    Napi::Error::New(env, std::string("Failed to open /dev/uinput: ") + strerror(errno))
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  // Enable relative movement events
  if (ioctl(uinput_fd, UI_SET_EVBIT, EV_REL) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_EVBIT EV_REL failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(uinput_fd, UI_SET_RELBIT, REL_X) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_RELBIT REL_X failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(uinput_fd, UI_SET_RELBIT, REL_Y) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_RELBIT REL_Y failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(uinput_fd, UI_SET_RELBIT, REL_WHEEL) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_RELBIT REL_WHEEL failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

  // Enable button events
  if (ioctl(uinput_fd, UI_SET_EVBIT, EV_KEY) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_EVBIT EV_KEY failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_LEFT) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_KEYBIT BTN_LEFT failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_RIGHT) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_KEYBIT BTN_RIGHT failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(uinput_fd, UI_SET_KEYBIT, BTN_MIDDLE) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_KEYBIT BTN_MIDDLE failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

  struct uinput_setup usetup;
  memset(&usetup, 0, sizeof(usetup));
  usetup.id.bustype = BUS_USB;
  usetup.id.vendor = 0x1234;
  usetup.id.product = 0x5678;
  snprintf(usetup.name, UINPUT_MAX_NAME_SIZE, "Tracking Virtual Mouse");

  if (ioctl(uinput_fd, UI_DEV_SETUP, &usetup) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_DEV_SETUP failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(uinput_fd, UI_DEV_CREATE) < 0) {
    close(uinput_fd); uinput_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_DEV_CREATE failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

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

  if (emit(uinput_fd, EV_REL, REL_X, dx) < 0) {
    Napi::Error::New(env, std::string("emit REL_X failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (emit(uinput_fd, EV_REL, REL_Y, dy) < 0) {
    Napi::Error::New(env, std::string("emit REL_Y failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (syn(uinput_fd) < 0) {
    Napi::Error::New(env, std::string("emit SYN failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

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

  if (emit(uinput_fd, EV_KEY, button, 1) < 0) { // Press
    Napi::Error::New(env, std::string("emit button press failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (syn(uinput_fd) < 0) {
    // Attempt to release the button before throwing
    emit(uinput_fd, EV_KEY, button, 0);
    syn(uinput_fd);
    Napi::Error::New(env, std::string("emit SYN after press failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (emit(uinput_fd, EV_KEY, button, 0) < 0) { // Release
    Napi::Error::New(env, std::string("emit button release failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (syn(uinput_fd) < 0) {
    Napi::Error::New(env, std::string("emit SYN after release failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

  return env.Undefined();
}

Napi::Value ScrollMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (uinput_fd < 0) {
    Napi::Error::New(env, "Mouse not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  int amount = info[0].As<Napi::Number>().Int32Value();
  if (emit(uinput_fd, EV_REL, REL_WHEEL, amount) < 0) {
    Napi::Error::New(env, std::string("emit REL_WHEEL failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (syn(uinput_fd) < 0) {
    Napi::Error::New(env, std::string("emit SYN failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

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
