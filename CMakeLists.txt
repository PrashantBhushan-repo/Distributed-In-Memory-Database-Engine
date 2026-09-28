cmake_minimum_required(VERSION 3.20)

project(
    redisx
    VERSION 0.1.0
    DESCRIPTION "Industry-Level Redis-Compatible In-Memory Database"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ------------------------------------------------------------
# Options & Sanitizers
# ------------------------------------------------------------
option(REDISX_BUILD_TESTS "Build RedisX test suite" ON)
option(REDISX_ENABLE_SANITIZER_ADDRESS "Enable AddressSanitizer and UndefinedBehaviorSanitizer" OFF)
option(REDISX_ENABLE_SANITIZER_THREAD "Enable ThreadSanitizer" OFF)

set(REDISX_WARN_FLAGS "")
if (CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    set(REDISX_WARN_FLAGS
        -Wall
        -Wextra
        -Wpedantic
        -Wconversion
        -Wsign-conversion
        -Werror
    )
endif()

if (REDISX_ENABLE_SANITIZER_ADDRESS)
    message(STATUS "Enabling AddressSanitizer and UndefinedBehaviorSanitizer")
    add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
elseif (REDISX_ENABLE_SANITIZER_THREAD)
    message(STATUS "Enabling ThreadSanitizer")
    add_compile_options(-fsanitize=thread)
    add_link_options(-fsanitize=thread)
endif()

# ------------------------------------------------------------
# Core Library
# ------------------------------------------------------------
add_library(redisx_core
    src/core/buffer.cpp
    src/core/logging.cpp
    src/core/time.cpp
)

target_include_directories(redisx_core
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx_core PRIVATE ${REDISX_WARN_FLAGS})
endif()

# ------------------------------------------------------------
# Networking Library
# ------------------------------------------------------------
add_library(redisx_net
    src/net/socket_utils.cpp
    src/net/event_loop.cpp
    src/net/connection.cpp
    src/net/listener.cpp
)

target_include_directories(redisx_net
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

target_link_libraries(redisx_net
    PUBLIC
        redisx_core
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx_net PRIVATE ${REDISX_WARN_FLAGS})
endif()

# ------------------------------------------------------------
# Server Executable
# ------------------------------------------------------------
add_executable(redisx
    src/main.cpp
)

target_link_libraries(redisx
    PRIVATE
        redisx_net
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx PRIVATE ${REDISX_WARN_FLAGS})
endif()

# ------------------------------------------------------------
# Testing
# ------------------------------------------------------------
if (REDISX_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()