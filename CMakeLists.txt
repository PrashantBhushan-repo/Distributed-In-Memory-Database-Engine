cmake_minimum_required(VERSION 3.20)

project(
    PBRedisDB
    VERSION 0.1.0
    DESCRIPTION "A high-performance distributed in-memory database engine"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ------------------------------------------------------------
# Compiler warnings
# ------------------------------------------------------------

if (CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(
        -Wall
        -Wextra
        -Wpedantic
        -Wconversion
        -Wsign-conversion
    )
endif()

# ------------------------------------------------------------
# Main library
# ------------------------------------------------------------

add_library(PBRedisDB_core
    src/server/tcp_server.cpp
    src/common/logger.cpp
)

target_include_directories(
    PBRedisDB_core
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

# ------------------------------------------------------------
# Server executable
# ------------------------------------------------------------

add_executable(
    PBRedisDB-server
    src/main.cpp
)

target_link_libraries(
    PBRedisDB-server
    PRIVATE
            PBRedisDB_core
)

# ------------------------------------------------------------
# Testing
# ------------------------------------------------------------

option(PBRedisDB_BUILD_TESTS "Build PBRedisDB tests" ON)

if (PBRedisDB_BUILD_TESTS)

    enable_testing()

    find_package(GTest REQUIRED)

    add_executable(
        PBRedisDB_tests
        tests/server_test.cpp
    )

    target_link_libraries(
        PBRedisDB_tests
        PRIVATE
            PBRedisDB_core
            GTest::gtest_main
    )

    include(GoogleTest)

    gtest_discover_tests(PBRedisDB_tests)

endif()