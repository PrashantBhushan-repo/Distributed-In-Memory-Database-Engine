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
)

target_link_libraries(unit_tests
    PRIVATE
        redisx_net
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
)

target_link_libraries(integration_tests
    PRIVATE
        redisx_net
        gtest_main
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(integration_tests PRIVATE ${REDISX_WARN_FLAGS})
endif()

gtest_discover_tests(integration_tests)
