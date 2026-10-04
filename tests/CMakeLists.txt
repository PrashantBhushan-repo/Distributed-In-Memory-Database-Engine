include(FetchContent)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.14.0
)

# For Windows / MinGW MSVC runtime matching
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

include(GoogleTest)

# ------------------------------------------------------------
# Unit Tests
# ------------------------------------------------------------
add_executable(unit_tests
    unit/buffer_test.cpp
    unit/time_test.cpp
    unit/event_loop_test.cpp
    unit/resp_reader_test.cpp
    unit/resp_writer_test.cpp
    unit/dict_test.cpp
    unit/rehash_test.cpp
    unit/keyspace_test.cpp
    unit/ttl_test.cpp
    unit/skiplist_test.cpp
    unit/encoding_test.cpp
    unit/persistence_test.cpp
)

target_link_libraries(unit_tests
    PRIVATE
        redisx_net
        redisx_proto
        redisx_db
        redisx_commands
        redisx_types
        redisx_memory
        redisx_persistence
        gtest_main
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(unit_tests PRIVATE ${REDISX_WARN_FLAGS})
endif()

gtest_discover_tests(unit_tests)

# ------------------------------------------------------------
# Integration Tests
# ------------------------------------------------------------
add_executable(integration_tests
    integration/echo_test.cpp
    integration/resp_test.cpp
    integration/storage_test.cpp
    integration/eviction_test.cpp
    integration/crash_test.cpp
)

target_link_libraries(integration_tests
    PRIVATE
        redisx_net
        redisx_proto
        redisx_db
        redisx_commands
        redisx_types
        redisx_memory
        redisx_persistence
        gtest_main
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(integration_tests PRIVATE ${REDISX_WARN_FLAGS})
endif()

gtest_discover_tests(integration_tests)

# ------------------------------------------------------------
# Fuzzing Targets
# ------------------------------------------------------------
if (REDISX_BUILD_FUZZERS)
    add_executable(resp_fuzz
        fuzz/resp_fuzz.cpp
    )

    target_link_libraries(resp_fuzz
        PRIVATE
            redisx_proto
            redisx_db
            redisx_commands
            redisx_types
            redisx_memory
    )

    target_compile_options(resp_fuzz PRIVATE -fsanitize=fuzzer,address)
    target_link_options(resp_fuzz PRIVATE -fsanitize=fuzzer,address)
endif()
