#----------------------------------------------------------------
# Generated CMake target import file for configuration "Release".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "thriftz::thriftz" for configuration "Release"
set_property(TARGET thriftz::thriftz APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(thriftz::thriftz PROPERTIES
  IMPORTED_IMPLIB_RELEASE "D:/finance_tracker/env/Library/lib/thriftzmd.lib"
  IMPORTED_LOCATION_RELEASE "D:/finance_tracker/env/Library/bin/thriftzmd.dll"
  )

list(APPEND _cmake_import_check_targets thriftz::thriftz )
list(APPEND _cmake_import_check_files_for_thriftz::thriftz "D:/finance_tracker/env/Library/lib/thriftzmd.lib" "D:/finance_tracker/env/Library/bin/thriftzmd.dll" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
