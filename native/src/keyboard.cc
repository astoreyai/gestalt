/**
 * Virtual keyboard via Linux uinput.
 * Creates a virtual keyboard device and provides keypress/combo functions.
 */

#include <napi.h>
#include <fcntl.h>
#include <unistd.h>
#include <linux/uinput.h>
#include <linux/input-event-codes.h>
#include <cstring>
#include <cerrno>
#include <sys/time.h>
#include <map>
#include <string>
#include <vector>

static int kb_fd = -1;

// Map common key names to Linux keycodes
static const std::map<std::string, int> KEY_MAP = {
  {"a", KEY_A}, {"b", KEY_B}, {"c", KEY_C}, {"d", KEY_D},
  {"e", KEY_E}, {"f", KEY_F}, {"g", KEY_G}, {"h", KEY_H},
  {"i", KEY_I}, {"j", KEY_J}, {"k", KEY_K}, {"l", KEY_L},
  {"m", KEY_M}, {"n", KEY_N}, {"o", KEY_O}, {"p", KEY_P},
  {"q", KEY_Q}, {"r", KEY_R}, {"s", KEY_S}, {"t", KEY_T},
  {"u", KEY_U}, {"v", KEY_V}, {"w", KEY_W}, {"x", KEY_X},
  {"y", KEY_Y}, {"z", KEY_Z},
  {"0", KEY_0}, {"1", KEY_1}, {"2", KEY_2}, {"3", KEY_3},
  {"4", KEY_4}, {"5", KEY_5}, {"6", KEY_6}, {"7", KEY_7},
  {"8", KEY_8}, {"9", KEY_9},
  {"enter", KEY_ENTER}, {"space", KEY_SPACE}, {"tab", KEY_TAB},
  {"escape", KEY_ESC}, {"backspace", KEY_BACKSPACE},
  {"ctrl", KEY_LEFTCTRL}, {"shift", KEY_LEFTSHIFT},
  {"alt", KEY_LEFTALT}, {"super", KEY_LEFTMETA},
  {"up", KEY_UP}, {"down", KEY_DOWN},
  {"left", KEY_LEFT}, {"right", KEY_RIGHT},
  {"delete", KEY_DELETE}, {"home", KEY_HOME}, {"end", KEY_END},
  {"pageup", KEY_PAGEUP}, {"pagedown", KEY_PAGEDOWN},
  {"f1", KEY_F1}, {"f2", KEY_F2}, {"f3", KEY_F3}, {"f4", KEY_F4},
  {"f5", KEY_F5}, {"f6", KEY_F6}, {"f7", KEY_F7}, {"f8", KEY_F8},
  {"f9", KEY_F9}, {"f10", KEY_F10}, {"f11", KEY_F11}, {"f12", KEY_F12}
};

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

static int lookupKey(const std::string& name) {
  auto it = KEY_MAP.find(name);
  if (it != KEY_MAP.end()) return it->second;
  return -1;
}

Napi::Value CreateKeyboard(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Close existing FD to prevent leak if create() is called multiple times
  if (kb_fd >= 0) {
    ioctl(kb_fd, UI_DEV_DESTROY);
    close(kb_fd);
    kb_fd = -1;
  }

  kb_fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
  if (kb_fd < 0) {
    Napi::Error::New(env, std::string("Failed to open /dev/uinput: ") + strerror(errno))
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (ioctl(kb_fd, UI_SET_EVBIT, EV_KEY) < 0) {
    close(kb_fd); kb_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_SET_EVBIT EV_KEY failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

  // Enable all keys in our map
  for (const auto& pair : KEY_MAP) {
    if (ioctl(kb_fd, UI_SET_KEYBIT, pair.second) < 0) {
      close(kb_fd); kb_fd = -1;
      Napi::Error::New(env, std::string("ioctl UI_SET_KEYBIT failed for key '") + pair.first + "': " + strerror(errno)).ThrowAsJavaScriptException();
      return env.Null();
    }
  }

  struct uinput_setup usetup;
  memset(&usetup, 0, sizeof(usetup));
  usetup.id.bustype = BUS_USB;
  usetup.id.vendor = 0x1234;
  usetup.id.product = 0x5679;
  snprintf(usetup.name, UINPUT_MAX_NAME_SIZE, "Tracking Virtual Keyboard");

  if (ioctl(kb_fd, UI_DEV_SETUP, &usetup) < 0) {
    close(kb_fd); kb_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_DEV_SETUP failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }
  if (ioctl(kb_fd, UI_DEV_CREATE) < 0) {
    close(kb_fd); kb_fd = -1;
    Napi::Error::New(env, std::string("ioctl UI_DEV_CREATE failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value PressKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (kb_fd < 0) {
    Napi::Error::New(env, "Keyboard not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string keyName = info[0].As<Napi::String>().Utf8Value();
  int keycode = lookupKey(keyName);
  if (keycode < 0) {
    Napi::Error::New(env, "Unknown key: " + keyName).ThrowAsJavaScriptException();
    return env.Null();
  }

  emit(kb_fd, EV_KEY, keycode, 1); // Press
  syn(kb_fd);
  emit(kb_fd, EV_KEY, keycode, 0); // Release
  syn(kb_fd);

  return env.Undefined();
}

Napi::Value KeyCombo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (kb_fd < 0) {
    Napi::Error::New(env, "Keyboard not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Array keys = info[0].As<Napi::Array>();
  std::vector<int> keycodes;

  for (uint32_t i = 0; i < keys.Length(); i++) {
    std::string name = keys.Get(i).As<Napi::String>().Utf8Value();
    int kc = lookupKey(name);
    if (kc < 0) {
      Napi::Error::New(env, "Unknown key: " + name).ThrowAsJavaScriptException();
      return env.Null();
    }
    keycodes.push_back(kc);
  }

  // Press all keys in order
  for (int kc : keycodes) {
    emit(kb_fd, EV_KEY, kc, 1);
    syn(kb_fd);
  }

  // Release all keys in reverse order
  for (auto it = keycodes.rbegin(); it != keycodes.rend(); ++it) {
    emit(kb_fd, EV_KEY, *it, 0);
    syn(kb_fd);
  }

  return env.Undefined();
}

Napi::Value DestroyKeyboard(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (kb_fd >= 0) {
    ioctl(kb_fd, UI_DEV_DESTROY);
    close(kb_fd);
    kb_fd = -1;
  }
  return env.Undefined();
}

Napi::Object InitKeyboard(Napi::Env env, Napi::Object exports) {
  Napi::Object keyboard = Napi::Object::New(env);
  keyboard.Set("create", Napi::Function::New(env, CreateKeyboard));
  keyboard.Set("pressKey", Napi::Function::New(env, PressKey));
  keyboard.Set("keyCombo", Napi::Function::New(env, KeyCombo));
  keyboard.Set("destroy", Napi::Function::New(env, DestroyKeyboard));
  exports.Set("keyboard", keyboard);
  return exports;
}
