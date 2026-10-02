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
option(REDISX_BUILD_FUZZERS "Build libFuzzer fuzzing targets" OFF)
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
    src/core/hash.cpp
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
# Database Storage Engine Library
# ------------------------------------------------------------
add_library(redisx_db
    src/db/dict.cpp
    src/db/keyspace.cpp
)

target_include_directories(redisx_db
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

target_link_libraries(redisx_db
    PUBLIC
        redisx_core
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx_db PRIVATE ${REDISX_WARN_FLAGS})
endif()

# ------------------------------------------------------------
# RESP Protocol Library
# ------------------------------------------------------------
add_library(redisx_proto
    src/proto/inline_commands.cpp
    src/proto/resp_reader.cpp
    src/proto/resp_writer.cpp
)

target_include_directories(redisx_proto
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

target_link_libraries(redisx_proto
    PUBLIC
        redisx_core
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx_proto PRIVATE ${REDISX_WARN_FLAGS})
endif()

# ------------------------------------------------------------
# Command Dispatcher & Commands Library
# ------------------------------------------------------------
add_library(redisx_commands
    src/commands/dispatcher.cpp
    src/commands/string_cmds.cpp
)

target_include_directories(redisx_commands
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

target_link_libraries(redisx_commands
    PUBLIC
        redisx_core
        redisx_proto
        redisx_db
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx_commands PRIVATE ${REDISX_WARN_FLAGS})
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
        redisx_proto
        redisx_db
        redisx_commands
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
        redisx_proto
        redisx_db
        redisx_commands
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx PRIVATE ${REDISX_WARN_FLAGS})
endif()

# ------------------------------------------------------------
# Testing & Fuzzing
# ------------------------------------------------------------
if (REDISX_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()