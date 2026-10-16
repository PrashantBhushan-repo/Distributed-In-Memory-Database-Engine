include(FetchContent)

FetchContent_Declare(
  googlebenchmark
  GIT_REPOSITORY https://github.com/google/benchmark.git
  GIT_TAG        v1.8.3
)

set(BENCHMARK_ENABLE_TESTING OFF CACHE BOOL "" FORCE)
set(BENCHMARK_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googlebenchmark)

# ------------------------------------------------------------
# Workload Generator Library
# ------------------------------------------------------------
add_library(redisx_bench_workloads
    workloads.cpp
)

target_include_directories(redisx_bench_workloads
    PUBLIC
        ${PROJECT_SOURCE_DIR}
        ${PROJECT_SOURCE_DIR}/include
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(redisx_bench_workloads PRIVATE ${REDISX_WARN_FLAGS})
endif()

# ------------------------------------------------------------
# Google Benchmark Targets
# ------------------------------------------------------------
add_executable(bench_dict
    bench_dict.cpp
)

target_link_libraries(bench_dict
    PRIVATE
        redisx_db
        redisx_types
        redisx_core
        benchmark::benchmark
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(bench_dict PRIVATE ${REDISX_WARN_FLAGS})
endif()

add_executable(bench_resp
    bench_resp.cpp
)

target_link_libraries(bench_resp
    PRIVATE
        redisx_proto
        redisx_core
        benchmark::benchmark
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(bench_resp PRIVATE ${REDISX_WARN_FLAGS})
endif()

add_executable(bench_end_to_end
    bench_end_to_end.cpp
)

target_link_libraries(bench_end_to_end
    PRIVATE
        redisx_bench_workloads
        redisx_db
        redisx_types
        redisx_core
        benchmark::benchmark
)

if (NOT REDISX_WARN_FLAGS STREQUAL "")
    target_compile_options(bench_end_to_end PRIVATE ${REDISX_WARN_FLAGS})
endif()
